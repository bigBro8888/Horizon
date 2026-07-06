@echo off
echo Adding Windows Firewall rule for port 8765...
netsh advfirewall firewall add rule name="Horizon Web" dir=in action=allow protocol=TCP localport=8765
echo.
echo Also open TCP 8765 in Tencent Cloud console -^> Firewall
echo.
pause
