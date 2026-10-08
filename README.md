# 红果短剧 API · VPS 一键部署版

把红果短剧的「目录 / 搜索 / 详情 / 播放」从 Cloudflare Worker 移植成 **VPS 上跑的 Node 服务**，纯零依赖（用 Node 18+ 自带全局 API），安装脚本一键部署，并**自动生成 `duanju.js`**（fw/rex 的 Forward 插件模块，apiBase 自动指向本 VPS）。

## 特性
- **交互式一键部署**：询问端口，直接回车默认 `6666`；自动装 Node、生成 `STREAM_SECRET`、注册 systemd、自动生成 `duanju.js`。
- 完全复用原 worker 的签名 / CENC 解密 / 目录解析逻辑，行为与 Cloudflare 版一致。
- 内存版 Cache 兼容层替代 `caches.default`，无需任何外部依赖。
- 服务自带 `/duanju.js` 静态托管，模块地址即 `http://<IP>:<端口>/duanju.js`。

## 目录结构
```
src/                   worker 源码（index.js + 签名/解密模块）
server.js              Node HTTP 服务（包一层 + caches 兼容层 + /duanju.js）
generate-duanju.js     生成 duanju.js（替换 apiBase）
duanju.template.js     duanju.js 模板
install.sh             一键安装（询问端口，默认 6666）
uninstall.sh           一键卸载
test/smoke.test.js     冒烟测试（npm test）
```

## 部署

把整个文件夹传到 VPS 后（root 或 sudo 运行）：

```bash
sudo bash install.sh
```

按提示输入端口（**直接回车默认 6666**）。完成后脚本会打印：
- **API 地址**：`http://<IP>:6666`
- **duanju.js 地址**：`http://<IP>:6666/duanju.js`
- **STREAM_SECRET**：随机生成的播放 token 密钥（务必留存）

## 在 Forward 里添加模块
方式一：直接把 `http://<IP>:6666/duanju.js` 作为模块地址加进 fw/rex。
方式二：下载 `duanju.js`，确认/修改其 `globalParams.apiBase` 为 `http://<IP>:6666` 后添加。

## 常用命令
```bash
systemctl status duanju        # 状态
journalctl -u duanju -f        # 日志
sudo bash uninstall.sh         # 卸载
```

## 可选环境变量
见 `/opt/duanju/.env`：`HONGGUO_MEDIA_HOSTS`（额外媒体域名白名单，逗号分隔）、`STREAM_TOKEN_TTL_SECONDS`（播放 token 有效期，默认 21600）。
