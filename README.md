# 红果 · 黄果 短剧 API · VPS 一键部署版

把「红果短剧」与「黄果短剧」的目录/搜索/详情/播放能力做成 **VPS 上跑的 Node 服务**（零外部依赖，用 Node 18+ 自带全局 API），安装脚本一键部署，并**自动生成合并后的 `duanju.js`**——一个 **Rex 聚合模块**，包含「红果」「黄果」两个大类及其细分频道。

## 特性
- **交互式一键部署**：询问端口，直接回车默认 `6666`；自动装 Node、生成 `STREAM_SECRET`、注册 systemd、生成 `duanju.js`。
- **红果短剧**：走后端 API（signing + CENC 解密，复用原 Cloudflare Worker 逻辑）。
- **黄果短剧**：服务端提供 `/cover` 封面解密代理；前端模块直连 `huangguoai.com` 抓取。
- **合并模块**：一个 `duanju.js` 同时包含
  - `红果短剧` 大类（小类：短剧 / 漫剧 / 榜单）
  - `黄果短剧` 大类（小类：热门推荐 / 最近上新 / AI短剧 / AI漫剧 / AI换脸 / AI魔改 / 专题 / 排行榜）
  - 统一搜索（可选红果 / 黄果数据源）、统一详情与播放分发
- 服务自带 `/duanju.js` 静态托管与 `/cover` 封面解密。

## 目录结构
```
src/                   红果 worker 源码（index.js + 签名/解密）
server.js              Node HTTP 服务（红果 API + /cover + /duanju.js）
generate-duanju.js     生成 duanju.js（填 apiBase + coverWorker）
duanju.template.js     合并模块模板（红果+黄果，含占位符）
install.sh             一键安装（询问端口，默认 6666）
uninstall.sh           一键卸载
test/smoke.test.js     服务冒烟测试（npm test）
```

## 一键部署
在 VPS 上（root）直接运行，脚本会**自动从仓库拉取全部文件**到 `/opt/duanju` 并安装：

```bash
curl -sL https://raw.githubusercontent.com/MakkaPakka518/duanju/main/install.sh | sudo bash
```

按提示输入端口（**直接回车默认 6666**）。脚本自动完成：
1. 询问端口（默认 6666）
2. 自动装 Node 20（如缺）
3. 从仓库下载 `server.js` / `src/` / `duanju.template.js` / `generate-duanju.js`
4. 生成随机 `STREAM_SECRET`
5. 生成 `duanju.js`（合并模块，apiBase + coverWorker 自动指向本机）
6. 注册 systemd 并启动、放行防火墙、健康检查

完成后脚本会打印：
- **API 地址**：`http://<IP>:6666`
- **duanju.js 地址**：`http://<IP>:6666/duanju.js`（合并模块）
- **STREAM_SECRET**：红果播放 token 密钥（留存）

卸载：
```bash
curl -sL https://raw.githubusercontent.com/MakkaPakka518/duanju/main/uninstall.sh | sudo bash
```

## 在 Rex 里添加模块
直接填 `http://<IP>:6666/duanju.js` 即可。模块已内置：
- 红果 API 地址（`apiBase`）= `http://<IP>:6666`
- 黄果封面代理（`coverWorker`）= `http://<IP>:6666/cover`

两大分类下即可选细分频道。黄果封面需要经 `/cover` 解密代理，如封面不显示请确认 `coverWorker` 已填写。

## 常用命令
```bash
systemctl status duanju        # 状态
journalctl -u duanju -f        # 日志
# 卸载（一行命令）
curl -sL https://raw.githubusercontent.com/MakkaPakka518/duanju/main/uninstall.sh | sudo bash
```

## 可选环境变量
见 `/opt/duanju/.env`：`HONGGUO_MEDIA_HOSTS`（额外媒体域名白名单）、`STREAM_TOKEN_TTL_SECONDS`（播放 token 有效期，默认 21600）。
