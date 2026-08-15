const WebSocket = require('ws');
const ws = new WebSocket('ws://localhost:9333/devtools/page/A90C18838B3E41DBB3556ECEE3B19107');
ws.on('open', () => {
  ws.send(JSON.stringify({ id: 1, method: 'Page.captureScreenshot', params: { format: 'png' } }));
});
ws.on('message', (data) => {
  const msg = JSON.parse(data.toString());
  if (msg.id === 1 && msg.result) {
    require('fs').writeFileSync('/home/ubuntu/webdev-static-assets/app-real-screenshot.png', Buffer.from(msg.result.data, 'base64'));
    console.log('Screenshot saved');
    ws.close();
    process.exit(0);
  }
});
