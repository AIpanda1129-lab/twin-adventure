# 部署说明

## 方案一：Node服务＋自己的服务器

Node.js 24及以上可直接运行`npm start`。默认只监听`127.0.0.1:4173`，由Nginx等反向代理提供HTTPS。静态页面与`/api/`请求同时转发到此服务。

可用环境变量：

|变量|用途|
|---|---|
|PORT|本机服务端口，默认4173|
|HOST|监听地址，默认127.0.0.1|
|DATA_DIR|SQLite与快照保存目录|
|SETUP_TOKEN|首次初始化口令，建议首次启动前自行设置|
|NODE_ENV|生产环境设置为production，启用Secure会话Cookie|

使用HTTPS访问生产服务。备份`DATA_DIR`并定期导出完整JSON。不要把`data/`或服务端源目录作为公开静态根目录。

## 方案二：CloudBase静态托管＋HTTP云函数

1. 准备自己的腾讯云CloudBase环境和HTTPS网站地址，安装并登录腾讯云官方CLI。
2. 将`.env.example`复制为`.env`，填写`TCB_ENV`、`ALLOWED_ORIGIN`、`API_BASE`。`ALLOWED_ORIGIN`是前端的HTTPS来源，不含末尾斜杠或路径。
3. 执行`npm run cloud:prepare`。脚本生成自己的`cloudbaserc.json`、前端连接地址、`cloud-setup-token.txt`以及云函数目录中的`bootstrap.json`。
4. 执行`npm ci --prefix cloud/twin-adventure-api`安装锁定依赖。
5. 在自己的环境创建`DB_COLLECTION`指定的数据库集合，设置为**ADMINONLY**。HTTP函数使用云端服务身份读写，浏览器不直接访问数据库。
6. 使用`cloudbaserc.json`部署独立HTTP函数`twin-adventure-api`，运行时与示例配置一致，并设置配置中的环境变量。
7. 将HTTP网关路径（例如`/twin-api`）指向该HTTP函数。路由上游类型为`WEB_SCF`，启用路径透传，使用控制台确认的实际网关域名。
8. 将`public/`作为静态网站目录部署。确保实际函数地址与`.env`中的`API_BASE`一致，前端域名与`ALLOWED_ORIGIN`一致。
9. 打开自己的正式网站，使用本地`cloud-setup-token.txt`中的口令，亲自设置家长和孩子密码。初始化只允许执行一次。

HTTP函数要求`TCB_ENV`和`ALLOWED_ORIGIN`。可选`DB_COLLECTION`，默认`twin_adventure_private`。服务端只读取口令的SHA-256哈希，不需要把明文口令上传到函数中。

腾讯云网关通常自动处理CORS。应用不重复写入`Access-Control-Allow-Origin`，避免产生浏览器不接受的重复响应头。请在自己的环境实际验证预检和登录，不要直接复制其他人的网关地址。

每次执行准备脚本时，如已存在完整初始化凭据，会沿用既有凭据；如果只存在一半文件则停止，不会自动重置正在使用的凭据。

## 不应提交的文件

- `.env`与生成的`cloudbaserc.json`。
- `cloud-setup-token.txt`和`cloud/twin-adventure-api/bootstrap.json`。
- `data/`、SQLite数据库、真实导出与备份。
- 云密钥、访问令牌、SSH私钥和依赖目录。

公开仓库只提供配置示例，不含作者的个人环境标识、网关地址、正式账户或家庭记录。
