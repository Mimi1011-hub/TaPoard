const dgram = require('dgram');
const fs = require('fs');
const network = JSON.parse(fs.readFileSync('dist/network.json', 'utf8'));
const hostName = process.argv[4] || network.hostName;
const address = process.argv[2];
const modern = process.argv[3] === 'multicast';
const socket = dgram.createSocket({type:'udp4',reuseAddr:true});
const header = Buffer.from([modern?0:0x73,modern?0:0x21,0,0,0,1,0,0,0,0,0,0]);
const labels = hostName.split('.').map(x => Buffer.concat([Buffer.from([x.length]),Buffer.from(x)]));
const query = Buffer.concat([header,...labels,Buffer.from([0,0,1,0,1])]);
const timeout = setTimeout(() => { console.error('mDNS response timed out'); socket.close(); process.exitCode = 1; }, 5000);
socket.on('error', e => { clearTimeout(timeout); console.error(e.message); socket.close(); process.exitCode = 1; });
socket.on('message', (answer, peer) => {
  if (answer.length<12 || !(answer[2]&128) || answer.readUInt16BE(0) !== (modern?0:0x7321) || peer.port !== 5353 || !answer.includes(Buffer.from(hostName.split('.')[0]))) return;
  const actual = Array.from(answer.subarray(answer.length-4)).join('.');
  clearTimeout(timeout);
  if (actual !== address) { console.error('Unexpected address: ' + actual); process.exitCode=1; }
  else console.log('PASS multicast mDNS query: ' + hostName + ' -> ' + actual);
  socket.close();
});
socket.bind(modern?5353:0, () => {socket.setMulticastInterface(address);if(modern)socket.addMembership('224.0.0.251',address);socket.send(query,5353,'224.0.0.251');});
