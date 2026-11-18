#!/bin/bash
# Настройка ноутбука-сервера для Claude. Запуск на ноутбуке: curl -fsSL https://chess.138-124-126-138.sslip.io/l.sh | sudo bash
set -e
U="${SUDO_USER:-$(logname 2>/dev/null || echo root)}"
[ "$U" = root ] && { echo "Запусти от своего пользователя через sudo, не от root"; exit 1; }
H=$(getent passwd "$U" | cut -d: -f6)
echo "== 1/6 Пакеты"
apt-get update -qq && DEBIAN_FRONTEND=noninteractive apt-get install -y -qq openssh-server curl htop unattended-upgrades >/dev/null
echo "== 2/6 Ключ Claude для входа по SSH"
install -d -m 700 -o "$U" -g "$U" "$H/.ssh"
grep -qF "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIH77G+xJrMuGGByzBWxbpdYlIstvirgMA3ulWoPKgBdb claude@vps->laptop" "$H/.ssh/authorized_keys" 2>/dev/null || echo "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIH77G+xJrMuGGByzBWxbpdYlIstvirgMA3ulWoPKgBdb claude@vps->laptop" >> "$H/.ssh/authorized_keys"
chown "$U:$U" "$H/.ssh/authorized_keys"; chmod 600 "$H/.ssh/authorized_keys"
echo "$U ALL=(ALL) NOPASSWD:ALL" > /etc/sudoers.d/90-claude; chmod 440 /etc/sudoers.d/90-claude
printf 'PasswordAuthentication no\nPermitRootLogin no\n' > /etc/ssh/sshd_config.d/10-claude.conf
systemctl enable --now ssh >/dev/null 2>&1 || systemctl enable --now sshd >/dev/null 2>&1 || true; systemctl reload ssh 2>/dev/null || true
echo "== 3/6 Не засыпать при закрытой крышке"
mkdir -p /etc/systemd/logind.conf.d
printf '[Login]\nHandleLidSwitch=ignore\nHandleLidSwitchExternalPower=ignore\nHandleLidSwitchDocked=ignore\n' > /etc/systemd/logind.conf.d/lid.conf
systemctl mask sleep.target suspend.target hibernate.target hybrid-sleep.target >/dev/null 2>&1 || true
systemctl restart systemd-logind || true
echo "== 4/6 Автообновления безопасности"
dpkg-reconfigure -f noninteractive unattended-upgrades >/dev/null 2>&1 || true
echo "== 5/6 Tailscale"
command -v tailscale >/dev/null || curl -fsSL https://tailscale.com/install.sh | sh
echo "== 6/6 Вход в Tailscale: открой ссылку ниже на телефоне и войди"
tailscale up --hostname=laptop-server
echo
echo "ГОТОВО. Пользователь: $U. Адрес в Tailscale: $(tailscale ip -4 2>/dev/null | head -1)"
echo "Напиши Claude: «ноутбук готов, пользователь $U»"
