@echo off
setlocal
if exist "%USERPROFILE%\AppData\Roaming\Antigravity\bin\agy-node.cmd" (
    "%USERPROFILE%\AppData\Roaming\Antigravity\bin\agy-node.cmd" "%~dp0server.js" %*
) else (
    node "%~dp0server.js" %*
)
