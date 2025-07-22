process.env.TZ = 'Asia/Shanghai';
const express = require('express');
const rateLimit = require('express-rate-limit');
const morgan = require('morgan');
const { status } = require('minecraft-server-util');
const dns = require('dns').promises;
const moment = require('moment-timezone');
const cors = require('cors');
// Load environment variables
require('dotenv').config();
const app = express();
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
    error: '请求过于频繁，请稍后再试',
    status: 429
  },
  statusCode: 429
});

// 应用速率限制到所有API路由
app.use('/3/*', rateLimitMiddleware);

console.log('MC Status API starting...');
console.log('Using port:', port);

// Add Shanghai timezone support for logging
morgan.token('shanghai-date', () => {
  return moment().tz('Asia/Shanghai').format('DD/MMM/YYYY:HH:mm:ss ZZ');
});
// Add request logging
app.use(morgan(':remote-addr - :remote-user [:shanghai-date] ":method :url HTTP/:http-version" :status :res[content-length] ":referrer" ":user-agent"', { stream: { write: message => console.log(message.trim()) } }));

// Add rate limiting
app.get('/3/:serverAddress', async (req, res) => {
  try {
    const { serverAddress } = req.params;
    const originalAddress = serverAddress;
    let [host, port = 25565] = serverAddress.split(':');
    port = parseInt(port, 10);
    // Resolve hostname to IP address
    try {
      const resolvedHost = await dns.lookup(host, { family: 4 });
      host = resolvedHost.address;
    } catch (error) {
      return res.status(400).json({ error: 'Failed to resolve hostname' });
    }
    
    // Validate port number
    if (isNaN(port) || port < 1 || port > 65535) {
      return res.status(400).json({
        error: 'Invalid port number. Must be between 1 and 65535',
        ip: host,
        port: port,
        online: false
      });
    }
    
    try {
      const response = await status(host, port, { timeout: 5000 });
      console.log('Received hostname:', originalAddress);
      
      // Parse version and software information
      const versionParts = response.version.name.match(/^([^0-9]+)?\s*([0-9\.\-]+.*)$/);
      const parsedSoftware = versionParts && versionParts[1] ? versionParts[1].trim() : '';
      const parsedVersion = versionParts && versionParts[2] ? versionParts[2].trim() : response.version.name;
      
      res.json({
        ip: host,
        port: port,
        debug: {
          ping: true,
          query: false,
          bedrock: false,
          srv: false,
          querymismatch: false,
          ipinsrv: false,
          cnameinsrv: false,
          animatedmotd: response.motd.raw.length > 1,
          cachehit: false,
          cachetime: Math.floor(Date.now() / 1000),
          cacheexpire: Math.floor(Date.now() / 1000) + 300,
          apiversion: 3,
          error: {}
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
        eula_blocked: false
      });
    } catch (error) {
      if (error.code === 'ECONNREFUSED' && !originalAddress.includes(':')) {
        return res.status(503).json({ error: '本API暂不支持检测SRV解析后的服务器地址' });
      }
      return res.status(500).json({ error: error.message });
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

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
}).on('error', (err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});

// 添加根路由以显示API使用说明
app.get('/', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html lang="zh-CN">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>MCStatus API 使用说明</title>
      <style>
        body { font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; line-height: 1.6; }
        h1 { color: #333; border-bottom: 2px solid #4CAF50; padding-bottom: 10px; }
        h2 { color: #4CAF50; margin-top: 20px; }
        pre { background-color: #f5f5f5; padding: 15px; border-radius: 5px; overflow-x: auto; }
        .endpoint { background-color: #e8f5e9; padding: 10px; border-left: 4px solid #4CAF50; margin: 10px 0; }
        .example { margin: 15px 0; }
      </style>
    </head>
    <body>
      <h1>MCStatus API 使用说明</h1>
      
      <h2>简介</h2>
      <p>这是一个用于查询Minecraft服务器状态的API服务。通过以下接口可以获取服务器的在线状态、玩家数量、版本信息等。</p>
      
      <h2>API端点</h2>
      
      <div class="endpoint">
        <h3>查询服务器状态</h3>
        <p><strong>GET /status/:address</strong></p>
        <p>查询指定地址的Minecraft服务器状态（默认端口25565）</p>
      </div>
      
      <div class="endpoint">
        <p><strong>GET /status/:address/:port</strong></p>
        <p>查询指定地址和端口的Minecraft服务器状态</p>
      </div>
      
      <h2>参数说明</h2>
      <ul>
        <li><code>:address</code> - 服务器地址（域名或IP）</li>
        <li><code>:port</code> - 服务器端口（可选，默认为25565）</li>
      </ul>
      
      <h2>请求示例</h2>
      <div class="example">
        <p><strong>不带端口（默认25565）：</strong></p>
        <pre>GET /status/mc.tbedu.top</pre>
      </div>
      
      <div class="example">
        <p><strong>带端口：</strong></p>
        <pre>GET /status/mc.tbedu.top/25566</pre>
      </div>
      
      <h2>响应示例</h2>
      <pre>{"ip":"192.168.1.1","port":25565,"debug":{"originalAddress":"mc.tbedu.top","resolvedIp":"192.168.1.1","responseTime":452,"cacheHit":false,"cachedAt":"2025-07-22T14:30:00+08:00"},"online":true,"motd":"欢迎来到我的世界服务器","players":{"online":15,"max":100},"version":"1.18.2","software":"Paper"}</pre>
      
      <h2>错误处理</h2>
      <ul>
        <li><strong>400 Bad Request</strong> - 无效的服务器地址或端口</li>
        <li><strong>500 Internal Server Error</strong> - 服务器内部错误</li>
        <li><strong>503 Service Unavailable</strong> - 无法连接到Minecraft服务器</li>
      </ul>
      
      <h2>时区说明</h2>
      <p>API返回的所有时间戳均使用<strong>上海时区（UTC+8）</strong></p>
    </body>
    </html>
  `);
});
