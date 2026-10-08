#!/usr/bin/env bash
# ============================================================
#  红果短剧 API — VPS 一键部署
#  交互式询问端口，直接回车默认 6666；自动装 Node、生成
#  STREAM_SECRET、生成 duanju.js（Forward 模块）并注册 systemd。
# ============================================================
set -e

if [ "$(id -u)" -ne 0 ]; then
  echo "❌ 请用 root 运行: sudo bash install.sh"
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
INSTALL_DIR="/opt/duanju"

# 仓库 raw 地址（用于一行 curl 部署时自动下载文件）
REPO_BASE="https://raw.githubusercontent.com/MakkaPakka518/duanju/main"
SRC_FILES="cenc.js crypto.js hongguo.js hongguo-signing.js index.js signing-data.js signing-hash.js signing.js"

fetch_raw() {
  # $1=相对路径  $2=目标文件
  local url="$REPO_BASE/$1"
  local out="$2"
  echo "    下载 $url"
  curl -fsSL "$url" -o "$out" || { echo "❌ 下载失败: $url"; exit 1; }
}

# 准备源码：本地目录有文件则用本地，否则从仓库下载到临时目录
SRC=""
if [ -f "$SCRIPT_DIR/server.js" ]; then
  SRC="$SCRIPT_DIR"
else
  SRC="$(mktemp -d)"
  echo ">>> 从仓库下载项目文件 ..."
  fetch_raw "server.js"             "$SRC/server.js"
  fetch_raw "package.json"          "$SRC/package.json"
  fetch_raw "generate-duanju.js"    "$SRC/generate-duanju.js"
  fetch_raw "duanju.template.js"    "$SRC/duanju.template.js"
  mkdir -p "$SRC/src"
  for f in $SRC_FILES; do
    fetch_raw "src/$f" "$SRC/src/$f"
  done
fi

echo "================================================"
echo "  红果短剧 API · VPS 一键部署"
echo "================================================"

# ---------- 1) 询问端口（默认 6666） ----------
read -r -p "请输入监听端口（直接回车默认 6666）: " PORT
PORT="${PORT:-6666}"
if ! [ "$PORT" -ge 1 ] 2>/dev/null && [ "$PORT" -le 65535 ] 2>/dev/null; then
  PORT="6666"
fi
echo ">>> 使用端口: $PORT"

# ---------- 2) 检测公网 IP ----------
detect_ip() {
  for url in "https://api.ipify.org" "https://ipv4.icanhazip.com" "https://ifconfig.me"; do
    ip="$(curl -fsS -4 -m 5 "$url" 2>/dev/null)" || continue
    if [ -n "$ip" ] && [ "$ip" != "0.0.0.0" ]; then echo "$ip"; return 0; fi
  done
  echo ""
}
PUBLIC_IP="$(detect_ip)"
if [ -z "$PUBLIC_IP" ]; then
  echo "⚠️ 未检测到公网 IP，将用内网 IP 生成模块（可部署后手动改 duanju.js）"
  PUBLIC_IP="$(hostname -I 2>/dev/null | awk '{print $1}')"
fi
echo ">>> 公网 IP: $PUBLIC_IP"

# ---------- 3) 确保 Node >= 18 ----------
install_node() {
  local ver="v20.18.0"
  local arch="x64"
  [ "$(uname -m)" = "aarch64" ] && arch="arm64"
  echo ">>> 安装 Node.js ${ver} ..."
  mkdir -p /opt/nodejs
  cd /tmp
  curl -fsSL "https://nodejs.org/dist/${ver}/node-${ver}-linux-${arch}.tar.xz" -o node.tar.xz \
    || { echo "❌ Node 下载失败"; exit 1; }
  tar -xJf node.tar.xz -C /opt/nodejs 2>/dev/null \
    || { echo ">>> 缺少 xz 解压，安装依赖后重试..."; apt-get update -qq && apt-get install -y -qq xz-utils >/dev/null 2>&1; tar -xJf node.tar.xz -C /opt/nodejs; }
  local dir="/opt/nodejs/node-${ver}-linux-${arch}"
  ln -sf "$dir/bin/node" /usr/local/bin/node
  ln -sf "$dir/bin/npm"  /usr/local/bin/npm
  ln -sf "$dir/bin/npx"  /usr/local/bin/npx
  node -v
}
if command -v node >/dev/null 2>&1; then
  MAJOR="$(node -v | sed 's/^v//;s/\..*//')"
  if [ "$MAJOR" -ge 18 ] 2>/dev/null; then
    echo ">>> Node 已就绪: $(node -v)"
  else
    echo ">>> Node 版本过旧（$(node -v)），安装新版..."
    install_node
  fi
else
  install_node
fi
NODE_BIN="$(command -v node)"
echo ">>> 使用 Node: $NODE_BIN"

# ---------- 4) 生成 STREAM_SECRET ----------
SECRET="$(openssl rand -hex 32 2>/dev/null || head -c64 /dev/urandom | tr -dc 'a-f0-9' | head -c64)"

# ---------- 5) 拷贝文件到安装目录 ----------
echo ">>> 安装到 $INSTALL_DIR ..."
mkdir -p "$INSTALL_DIR"
cp -r "$SRC/src"        "$INSTALL_DIR/src"
cp "$SRC/server.js"     "$INSTALL_DIR/server.js"
cp "$SRC/package.json"  "$INSTALL_DIR/package.json"
cp "$SRC/generate-duanju.js" "$INSTALL_DIR/generate-duanju.js"
cp "$SRC/duanju.template.js" "$INSTALL_DIR/duanju.template.js"

# ---------- 6) 写环境配置 ----------
cat > "$INSTALL_DIR/.env" <<EOF
PORT=$PORT
STREAM_SECRET=$SECRET
HONGGUO_MEDIA_HOSTS=
STREAM_TOKEN_TTL_SECONDS=21600
EOF

# ---------- 7) 生成 duanju.js（指向本 VPS API） ----------
"$NODE_BIN" "$INSTALL_DIR/generate-duanju.js" --base "http://$PUBLIC_IP:$PORT" --out "$INSTALL_DIR/duanju.js"

# ---------- 8) 注册 systemd 服务 ----------
cat > /etc/systemd/system/duanju.service <<EOF
[Unit]
Description=Hongguo Short Drama API (VPS)
After=network.target

[Service]
WorkingDirectory=$INSTALL_DIR
EnvironmentFile=$INSTALL_DIR/.env
ExecStart=$NODE_BIN $INSTALL_DIR/server.js
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable duanju.service >/dev/null 2>&1
systemctl restart duanju.service
sleep 2

# ---------- 9) 防火墙放行 ----------
if command -v ufw >/dev/null 2>&1 && ufw status 2>/dev/null | grep -qi active; then
  ufw allow "$PORT/tcp" >/dev/null 2>&1 && echo ">>> ufw 已放行 $PORT"
fi
if command -v firewall-cmd >/dev/null 2>&1 && firewall-cmd --state >/dev/null 2>&1; then
  firewall-cmd --permanent --add-port="$PORT/tcp" >/dev/null 2>&1
  firewall-cmd --reload >/dev/null 2>&1
  echo ">>> firewalld 已放行 $PORT"
fi

# ---------- 10) 健康检查 ----------
echo ">>> 健康检查..."
if curl -fsS -m 5 "http://127.0.0.1:$PORT/healthz" >/dev/null 2>&1; then
  echo "✅ 服务已启动"
else
  echo "⚠️ 服务未通过健康检查，请查看日志: journalctl -u duanju.service -n 50"
fi

echo ""
echo "================================================"
echo "✅ 部署完成"
echo "  API 地址 :  http://$PUBLIC_IP:$PORT"
echo "  duanju.js:  http://$PUBLIC_IP:$PORT/duanju.js"
echo "  STREAM_SECRET: $SECRET"
echo "================================================"
echo ""
echo "  Forward 添加模块："
echo "    方式1：直接填 duanju.js 地址  $PUBLIC_IP:$PORT/duanju.js"
echo "    方式2：下载后把 apiBase 填成 http://$PUBLIC_IP:$PORT"
echo ""
echo "  查看状态: systemctl status duanju   日志: journalctl -u duanju -f"
echo "  卸载:     bash uninstall.sh"
