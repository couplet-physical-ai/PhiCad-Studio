@echo off
setlocal
rem openpcb-mcp - stdio MCP bridge into the running OpenPCB app.
rem
rem Runs on the Electron binary shipped inside the app (ELECTRON_RUN_AS_NODE
rem makes it behave as plain Node), so a system Node install is not required.
rem
rem Layout: <install>\resources\mcp\openpcb-mcp.cmd
rem         <install>\OpenPCB.exe                    <- ..\..\OpenPCB.exe

set "HERE=%~dp0"
set "SHIM=%HERE%shim.js"

if not exist "%SHIM%" (
  echo openpcb-mcp: bridge not found at "%SHIM%" ^(broken install?^) 1>&2
  exit /b 1
)

set "ELECTRON_RUN_AS_NODE=1"

if exist "%HERE%..\..\OpenPCB.exe" (
  "%HERE%..\..\OpenPCB.exe" "%SHIM%" %*
  exit /b %ERRORLEVEL%
)

where node >nul 2>&1
if %ERRORLEVEL%==0 (
  node "%SHIM%" %*
  exit /b %ERRORLEVEL%
)

echo openpcb-mcp: could not locate the OpenPCB runtime next to "%HERE%" 1>&2
exit /b 1
