process.env.TZ = 'Asia/Shanghai';
const express = require('express');
const rateLimit = require('express-rate-limit');
const morgan = require('morgan');
const { status, statusBedrock } = require('minecraft-server-util');
const dns = require('dns').promises;
const moment = require('moment-timezone');
const cors = require('cors');
const net = require('net');
const path = require('path');
const fs = require('fs');
const rfs = require('rotating-file-stream');
const chalk = require('chalk');
const app = express();

// Load environment variables
require('dotenv').config();

// Initialize API call statistics
const statsPath = path.join(__dirname, 'stats.json');
let stats = {
  totalCalls: 0,
  dailyCalls: {}
};

// Read existing stats if file exists
if (fs.existsSync(statsPath)) {
  try {
    stats = JSON.parse(fs.readFileSync(statsPath, 'utf8'));
  } catch (error) {
    console.error('Failed to read stats file:', error);
  }
} else {
  // Create stats file if it doesn't exist
  try {
    fs.writeFileSync(statsPath, JSON.stringify(stats, null, 2));
  } catch (error) {
    console.error('Failed to create stats file:', error);
  }
}

// Update call statistics
function updateCallStats() {
  const today = moment().tz('Asia/Shanghai').format('YYYY-MM-DD');
  stats.totalCalls++;
  stats.dailyCalls[today] = (stats.dailyCalls[today] || 0) + 1;
  
  try {
    fs.writeFileSync(statsPath, JSON.stringify(stats, null, 2));
  } catch (error) {
    console.error('Failed to write stats:', error);
  }
}

// Create logs directory if it doesn't exist
const logDirectory = path.join(__dirname, 'logs');
fs.existsSync(logDirectory) || fs.mkdirSync(logDirectory);

// 添加上海时区日期格式化token
morgan.token('shanghai-date', () => {
  return moment().tz('Asia/Shanghai').format('YYYY-MM-DD HH:mm:ss');
});

// 文件日志格式
const logFormat = ':remote-addr - [:shanghai-date] ":method :url HTTP/:http-version" :status :res[content-length] ":referrer" ":user-agent"';

// 自定义彩色日志格式
const coloredLogFormat = function (tokens, req, res) {
  const statusColor = res.statusCode >= 500 ? chalk.red
    : res.statusCode >= 400 ? chalk.yellow
    : res.statusCode >= 300 ? chalk.cyan
    : res.statusCode >= 200 ? chalk.green
    : chalk.white;

  return [
    chalk.gray(tokens['remote-addr'](req, res)),
    chalk.white(' - '),
    chalk.blue(`[${tokens['shanghai-date'](req, res)}]`),
    chalk.white(' "'),
    chalk.green(tokens.method(req, res)),
    chalk.white(' '),
    chalk.cyan(tokens.url(req, res)),
    chalk.white(' HTTP/'),
    chalk.gray(tokens['http-version'](req, res)),
    chalk.white('" '),
    statusColor(tokens.status(req, res)),
    chalk.white(' '),
    chalk.gray(tokens['res[content-length]'] || '-'),
    chalk.white(' "'),
    chalk.gray(tokens.referrer(req, res) || '-'),
    chalk.white('" "'),
    chalk.gray(tokens['user-agent'](req, res)),
    chalk.white('"')
  ].join('');
};

// 配置每日轮转日志流，使用动态日期生成文件名
const accessLogStream = rfs.createStream(() => {
  return moment().tz('Asia/Shanghai').format('YYYY-MM-DD') + '.log';
}, {
  interval: '1d',
  path: logDirectory,
  maxSize: '10M', // 可选：添加文件大小限制
  maxFiles: 180 // 可选：自动删除180天前的日志
});

// 中间件
app.use(express.json());
// 日志输出到文件
app.use(morgan(logFormat, { stream: accessLogStream }));
// 彩色日志输出到控制台
app.use(morgan(coloredLogFormat));
const port = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

// Enable CORS for all origins
app.use(cors({ origin: '*' }));

// 信任代理配置
if (process.env.TRUST_PROXY) {
  app.set('trust proxy', process.env.TRUST_PROXY);
}

// 添加速率限制中间件
const rateLimitMiddleware = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000'),
  max: parseInt(process.env.RATE_LIMIT_MAX || '100'),
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: 'Too many requests, please try again later',
    status: 429
  },
  statusCode: 429
});

// 应用速率限制到所有API路由
app.use('/3/*', rateLimitMiddleware);

console.log('MC Status API');
console.log(`Author: FeltSquirrel727`);
console.log(`Version: ${require('./package.json').version}`);
console.log('Using port:', port);
console.log('Starting...');

// Add Shanghai timezone support for logging
morgan.token('shanghai-date', () => {
  return moment().tz('Asia/Shanghai').format('DD/MMM/YYYY:HH:mm:ss ZZ');
});
// Request logging
// app.use(morgan(':remote-addr - [:shanghai-date] ":method :url HTTP/:http-version" :status :res[content-length] ":referrer" ":user-agent"', { stream: { write: message => console.log(message.trim()) } }));

// Add rate limiting
app.get('/3/:serverAddress', async (req, res) => {
  updateCallStats();
  try {
    const { serverAddress } = req.params;
    const originalAddress = serverAddress;
    let [host, port = 25565] = serverAddress.split(':');
    port = parseInt(port, 10);
    
    // Check for SRV record
    let srvRecordFound = false;
    try {
      const srvRecords = await dns.resolveSrv(`_minecraft._tcp.${host}`);
      if (srvRecords.length > 0) {
        // Use the first SRV record
        const srv = srvRecords[0];
        host = srv.name;
        port = srv.port;
        srvRecordFound = true;
      }
    } catch (error) {
      // No SRV record found, continue with original host and port
    }
    
    // Resolve hostname to IP address
    try {
      const resolvedHost = await dns.lookup(host, { family: 4 });
      host = resolvedHost.address;
    } catch (error) {
      return res.status(200).json({
        ip: host,
        port: port,
        online: false,
        debug: {
          error: {
            message: 'Failed to resolve hostname'
          }
        }
      });
    }
    
    // Validate port number
    if (isNaN(port) || port < 1 || port > 65535) {
      return res.status(200).json({
        ip: host,
        port: port,
        online: false,
        debug: {
          error: {
            message: 'Invalid port number. Must be between 1 and 65535'
          }
        }
      });
    }
    
    try {
      // Measure TCP latency
      const latency = await new Promise((resolve, reject) => {
        const startTime = Date.now();
        const socket = net.createConnection({ host, port }, () => {
          const latency = Date.now() - startTime;
          socket.destroy();
          resolve(latency);
        });
        socket.setTimeout(5000);
        socket.on('timeout', () => reject(new Error('TCP connection timeout')));
        socket.on('error', (err) => reject(err));
      });
      
      const response = await status(host, port, { timeout: 5000 });
      console.log('Received hostname:', originalAddress);
      
      // Parse version and software information
      const versionParts = response.version.name.match(/^([^0-9]+)?\s*([0-9\.\-]+.*)$/);
      const parsedSoftware = versionParts && versionParts[1] ? versionParts[1].trim() : '';
      const parsedVersion = versionParts && versionParts[2] ? versionParts[2].trim() : response.version.name;
      
      res.json({
        ip: host,
        port: port,
        latency: latency,
        debug: {
          ping: true,
          srv: srvRecordFound,
          animatedmotd: response.motd.raw.length > 1,
          cachetime: Math.floor(Date.now() / 1000),
          apiversion: 3,
        },
        motd: {
          raw: response.motd.raw,
          clean: response.motd.clean,
          html: response.motd.html
        },
        players: {
          online: response.players.online,
          max: response.players.max
        },
        version: parsedVersion,
        online: true,
        hostname: originalAddress,
        icon: response.favicon || '',
        software: response.software || parsedSoftware || '',
      });
    } catch (error) {
      return res.status(200).json({
        ip: host,
        port: port,
        online: false,
        debug: {
          error: {
            message: error.message
          }
        }
      });
    }
  } catch (error) {
    res.json({
      ip: req.params.serverAddress.split(':')[0] || req.params.serverAddress,
      port: parseInt(req.params.serverAddress.split(':')[1], 10) || 25565,
      online: false,
      debug: {
        error: {
          message: error.message
        }
      }
    });
  }
});

// Add Bedrock Edition server status endpoint
app.get('/bedrock/3/:serverAddress', async (req, res) => {
  updateCallStats();
  try {
    const { serverAddress } = req.params;
    const originalAddress = serverAddress;
    let [host, port = 19132] = serverAddress.split(':');
    port = parseInt(port, 10);
    
    // Resolve hostname to IP address
    try {
      const resolvedHost = await dns.lookup(host, { family: 4 });
      host = resolvedHost.address;
    } catch (error) {
      return res.status(200).json({
        ip: host,
        port: port,
        online: false,
        debug: {
          error: {
            message: 'Failed to resolve hostname'
          }
        }
      });
    }
    
    // Validate port number
    if (isNaN(port) || port < 1 || port > 65535) {
      return res.status(200).json({
        ip: host,
        port: port,
        online: false,
        debug: {
          error: {
            message: 'Invalid port number. Must be between 1 and 65535'
          }
        }
      });
    }
    
    try {
      const response = await statusBedrock(host, port, { timeout: 5000 });
      
      res.json({
        ip: host,
        port: port,
        debug: {
          ping: true,
          animatedmotd: response.motd.raw.length > 1,
          cachetime: Math.floor(Date.now() / 1000),
          apiversion: 3,
        },
        motd: {
          raw: response.motd.raw,
          clean: response.motd.clean,
          html: response.motd.html
        },
        players: {
          online: response.players.online,
          max: response.players.max
        },
        version: response.version.name,
        online: true,
        hostname: originalAddress,
      });
    } catch (error) {
      return res.status(200).json({
        ip: host,
        port: port,
        online: false,
        debug: {
          error: {
            message: error.message
          }
        }
      });
    }
  } catch (error) {
    res.json({
      ip: req.params.serverAddress.split(':')[0] || req.params.serverAddress,
      port: parseInt(req.params.serverAddress.split(':')[1], 10) || 19132,
      online: false,
      debug: {
        error: {
          message: error.message
        }
      }
    });
  }
});

app.listen(port, () => {
  console.log(`Successfully started server on port ${port}`);
}).on('error', (err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});

// 添加根路由以显示API使用说明
app.get('/', (req, res) => {
  const today = moment().tz('Asia/Shanghai').format('YYYY-MM-DD');
  const yesterday = moment().tz('Asia/Shanghai').subtract(1, 'day').format('YYYY-MM-DD');
  
  res.send(`
<!DOCTYPE html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <link rel="icon" href="/favicon.ico" type="image/x-icon" />
    <title>MCStatus API 使用说明</title>
    <style>
      body {
        font-family: Arial, sans-serif;
        max-width: 800px;
        margin: 0 auto;
        padding: 20px;
        line-height: 1.6;
      }
      h1 {
        color: #333;
        border-bottom: 2px solid #4CAF50;
        padding-bottom: 10px;
      }
      h2 {
        color: #4CAF50;
        margin-top: 20px;
      }
      pre {
        background-color: #f5f5f5;
        padding: 15px;
        border-radius: 5px;
        overflow-x: auto;
      }
      .endpoint {
        background-color: #e8f5e9;
        padding: 10px;
        border-left: 4px solid #4CAF50;
        margin: 10px 0;
      }
      .example {
        margin: 15px 0;
      }
      .stats {
        background-color: #e8f5e9;
        border-radius: 5px;
        margin: 20px 0;
        padding: 5px 20px;
      }
    </style>
  </head>
  <body>
    <h1>MCStatus API 使用说明</h1>

    <h2>简介</h2>
    <p>
      这是一个用于查询Minecraft服务器状态的API服务。通过以下接口可以获取服务器的在线状态、玩家数量、版本信息等。
    </p>

    <div class="stats">
      <h3>API调用统计</h3>
      <p>累计调用次数: ${stats.totalCalls}</p>
      <p>今日调用次数: ${stats.dailyCalls[today] || 0}</p>
      <p>昨日调用次数: ${stats.dailyCalls[yesterday] || 0}</p>
    </div>

    <h2>API端点</h2>

    <div class="endpoint">
      <h3>Java版服务器状态</h3>
      <p><strong>GET /3/[address]</strong></p>
      <p>
        查询指定地址的Minecraft Java版服务器状态（默认端口25565，支持SRV解析）
      </p>
    </div>

    <div class="endpoint">
      <p><strong>GET /3/[address]:[port]</strong></p>
      <p>查询指定地址和端口的Minecraft Java版服务器状态</p>
    </div>

    <div class="endpoint">
      <h3>基岩版服务器状态</h3>
      <p><strong>GET /bedrock/3/[address]</strong></p>
      <p>
        查询指定地址的Minecraft基岩版服务器状态（默认端口19132，不支持SRV解析）
      </p>
    </div>

    <div class="endpoint">
      <p><strong>GET /bedrock/3/[address]:[port]</strong></p>
      <p>查询指定地址和端口的Minecraft基岩版服务器状态</p>
    </div>

    <h2>参数说明</h2>
    <ul>
      <li><code>[address]</code> - 服务器地址（域名或IP）</li>
      <li>
        <code>[port]</code> - 服务器端口（可选，Java版默认25565，基岩版默认19132）
      </li>
    </ul>

    <h2>请求示例</h2>
    <div class="example">
      <p><strong>Java版（不带端口）：</strong></p>
      <pre>GET /3/mc.tbedu.top</pre>
    </div>

    <div class="example">
      <p><strong>Java版（带端口）：</strong></p>
      <pre>GET /3/mc.tbedu.top:25565</pre>
    </div>

    <div class="example">
      <p><strong>基岩版（不带端口）：</strong></p>
      <pre>GET /bedrock/3/mc.tbedu.top</pre>
    </div>

    <div class="example">
      <p><strong>基岩版（带端口）：</strong></p>
      <pre>GET /bedrock/3/mc.tbedu.top:19132</pre>
    </div>

    <h2>响应示例</h2>
    <h3>Java版响应：</h3>
    <pre>
{
  "ip": "192.168.1.1",
  "port": 25565,
  "latency": 45,
  "online": true,
  "motd": {
    "raw": "欢迎来到我的世界服务器",
    "clean": "欢迎来到我的世界服务器",
    "html": "&lt;span style='color: #00FF00'&gt;欢迎来到我的世界服务器&lt;/span&gt;"
  },
  "players": {
    "online": 15,
    "max": 100
  },
  "version": "1.18.2",
  "software": "Paper",
  "srvRecord": true
}
    </pre>

    <h3>基岩版响应：</h3>
    <pre>
{
  "ip": "192.168.1.1",
  "port": 19132,
  "online": true,
  "motd": {
    "raw": "欢迎来到基岩版服务器",
    "clean": "欢迎来到基岩版服务器",
    "html": "&lt;span style='color: #00FF00'&gt;欢迎来到基岩版服务器&lt;/span&gt;"
  },
  "players": {
    "online": 8,
    "max": 50
  },
  "version": "1.19.20"
}
    </pre>

    <h2>时区说明</h2>
    <p>API返回的所有时间戳均使用<strong>上海时区（UTC+8）</strong></p>
    <p style='text-align: center; margin-top: 40px; color: #666;'>版权所有 &copy; ${new Date().getFullYear()} FeltSquirrel727 保留所有权利</p>
  </body>
</html>
  `);
});

// 静态文件服务中间件
app.use(express.static(path.join(__dirname, 'public')));
