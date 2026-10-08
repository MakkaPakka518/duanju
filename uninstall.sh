#!/usr/bin/env bash
# 红果短剧 API — VPS 卸载
set -e
if [ "$(id -u)" -ne 0 ]; then
  echo "❌ 请用 root 运行: sudo bash uninstall.sh"
  exit 1
fi

echo ">>> 停止并移除服务..."
systemctl stop duanju.service 2>/dev/null || true
systemctl disable duanju.service 2>/dev/null || true
rm -f /etc/systemd/system/duanju.service
systemctl daemon-reload

echo ">>> 删除安装目录 /opt/duanju ..."
rm -rf /opt/duanju

echo "✅ 已卸载"
