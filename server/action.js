const FileTransfer = require('./ffi/file_transfer.js')
const {ipcRenderer} = require('electron');
const LocalStorage = require('node-localstorage').LocalStorage
const net = require('net')
const dgram = require('dgram');
const iconv = require('iconv-lite')
const http = require('http')
const fs = require('fs')
const Path = require('path')

let defaultDiscoveryAddress ="239.6.6.6"
let defaultDiscoveryPort = 41234
let logMessage = '';

Date.prototype.Format = function(fmt)   
{
  var o = {
    "M+" : this.getMonth()+1,                 //月份   
    "d+" : this.getDate(),                    //日   
    "h+" : this.getHours(),                   //小时   
    "m+" : this.getMinutes(),                 //分   
    "s+" : this.getSeconds(),                 //秒   
    "q+" : Math.floor((this.getMonth()+3)/3), //季度   
    "S"  : this.getMilliseconds()             //毫秒   
  };
  if(/(y+)/.test(fmt))   
    fmt=fmt.replace(RegExp.$1, (this.getFullYear()+"").substr(4 - RegExp.$1.length));   
  for(var k in o)   
    if(new RegExp("("+ k +")").test(fmt))   
  fmt = fmt.replace(RegExp.$1, (RegExp.$1.length==1) ? (o[k]) : (("00"+ o[k]).substr((""+ o[k]).length)));   
  return '[' + fmt + '] ';   
} 

function ShowLog(message) {
  message = new Date().Format("hh:mm:ss.S") + message;
  console.log(message);
  logMessage = logMessage + message + '\n';
  $("#outputArea").val(logMessage);
  $("#outputArea").scrollTop($("#outputArea").prop("scrollHeight"));
}

window.addEventListener('keyup', (e) => {
  //开启调试工具
  if (e.code === "F12")
    ipcRenderer.send('open-devtools')
}, true)

const Protocol = {
    tcp: 0,
    http: 1,
    multicast: 2
}

class FileTransferView {
  constructor(controller, storage) {
    this.controller = controller;
    this.storage = storage
    this.serverIp = null
    this.serverPort = null
    this.multicastIp = null 
    this.multicastPort = null 
    this.fileToSend = null
    this.protocol = 0
    if (storage.length != 0) {
      this.serverIp = storage.getItem('serverIp')
      this.serverPort = storage.getItem('serverPort')
      this.multicastIp = storage.getItem('multicastIp')
      this.multicastPort = storage.getItem('multicastPort')
      this.protocol = Number(storage.getItem('protocol'))
    }
    this.registerStartServer();
    this.registerSendButton();
    this.registerCancelButton();
    this.registerUseTCPCheckbox();

    $('#serverIp').val(this.serverIp)
    $('#serverPort').val(this.serverPort)
    $('#multicastIp').val(this.multicastIp)
    $('#multicastPort').val(this.multicastPort)
    $('#protocolRadios input:radio').eq(this.protocol).attr('checked', 'true')
    $('#protocolRadios input:radio:checked').change()
    // Add the following code if you want the name of the file appear on select
    $(".custom-file-input").on("change", ()=>{
      let elem = $(".custom-file-input")
      var fileName = elem.val().split("\\").pop();
      elem.siblings(".custom-file-label").addClass("selected").html(fileName);
      this.checkInputs();
    });

  }

  registerStartServer() {
    $('#startServerButton').on('click', (event)=>{
      if (!this.checkInputs())
        return false;
      this.serverIp = $('#serverIp').val();
      this.controller.startServer(this.serverIp, 6669);
      if (this.protocol == Protocol.http)
        this.controller.startHttpServer(this.serverIp, this.serverPort)
      else
        this.controller.startFileTransferServer(this.serverIp, this.serverPort)
      this.storeAllSettings();
      return false;
    })
  }

  disableStartServer() {
    $('#serverIp').attr('disabled','disabled');
    $('#protocolRadios input:radio').attr('disabled','disabled');
    $('#sendButton').removeAttr('hidden')
    $('#startServerButton').hide()
  }

  registerSendButton() {
    $("#sendButton").on('click', (event)=>{
      if (!this.checkInputs())
        return false;
      this.serverIp = $('#serverIp').val();
      this.serverPort = Number($('#serverPort').val());
      if (this.protocol != Protocol.multicast) {
        this.multicastIp = null;
        this.multicastPort = null;
      }
      else {
        this.multicastIp = $('#multicastIp').val();
        this.multicastPort = Number($('#multicastPort').val());
      }
      this.fileToSend = $('#inputFile').prop('files')[0].path
      //encode filename to 'gbk', so that chinese string can be recognized.
      let tmp = iconv.encode(this.fileToSend, 'gbk')
      if (this.protocol === Protocol.tcp)
        this.controller.sendFileByTCP(this.serverIp, this.serverPort, tmp);
      else if (this.protocol === Protocol.multicast)
        this.controller.sendFileByMulticast(
            this.multicastIp, this.multicastPort, this.serverIp, this.serverPort, tmp);
      else {
        this.controller.sendFileByHttp(this.serverIp, this.serverPort, tmp)
      }
      this.storeAllSettings();
      return false;
    })
  }

  registerCancelButton() {
    $("#cancelButton").on('click', (event)=>{
      this.controller.cancelSend();
      return false;
    });
  }

  registerUseTCPCheckbox() {
    $('#protocolRadios input:radio').change(()=>{
      this.protocol = Number($('#protocolRadios input:radio:checked').val())
      if (this.protocol != Protocol.multicast) {
        $('#multicastForm').attr('hidden', 'hidden')
      } else {
        $('#multicastForm').removeAttr('hidden')
      }
      return false;
    })
  }

  flashClientList(clientGroup) {
    let clientList = $("#clientList")
    clientList.empty()
    for(let idx = 0; idx < clientGroup.length; idx++) {
      let client = clientGroup[idx]
      clientList.append("<li class='list-group-item d-flex justify-content-between align-items-center'>"+
        client.remoteAddress + ':' + client.remotePort +
        "<span class='badge badge-pill badge-success' id=client_" + idx + ">" + idx + "</span>" +
        '</li>');
    }
    $("#clientCount").html(clientGroup.length);
  }

  onNotifyAllClient(action, clientGroup) {
    if (action == "start") {
      for(let idx = 0; idx < clientGroup.length; idx++) {
        let client_node = "#client_" + idx
        if ($(client_node).hasClass("badge-success")) {
          $(client_node).removeClass("badge-success")
          $(client_node).addClass("badge-danger")
        }
      }
    } else if(action == "stop") {
      for(let idx = 0; idx < clientGroup.length; idx++) {
        let client_node = "#client_" + idx
        if ($(client_node).hasClass("badge-success") || 
            $(client_node).hasClass("badge-warning")) {
          $(client_node).removeClass("badge-success")
          $(client_node).removeClass("badge-warning")
          $(client_node).addClass("badge-danger")
        }
      }
    }
  }

  onClientResponse(action, client_idx) {
    if (client_idx == -1)
      return
    if (action == "start_response") {
      let client_node = "#client_" + client_idx
      $(client_node).removeClass("badge-danger")
      $(client_node).addClass("badge-warning")
    } else if (action == "stop_response") {
      let client_node = "#client_" + client_idx
      $(client_node).removeClass("badge-danger")
      $(client_node).addClass("badge-success")
    } else if (action == "finish") {
      let client_node = "#client_" + client_idx
      $(client_node).removeClass("badge-warning")
      $(client_node).addClass("badge-success")
    }
  }

  onClientSendFinish(client_idx) {

  }

  setSendingStatus(status) {
    if (status) {
      $("#sendButton").attr("hidden", "hidden"); 
      $("#cancelButton").removeAttr("hidden"); 
    } else {
      $("#sendButton").removeAttr("hidden"); 
      $("#cancelButton").attr("hidden", "hidden"); 
    }
  }

  checkInputs() {
    let elem = ['#serverIp', '#serverPort', '#inputFile'];
    if (this.protocol === Protocol.multicast) {
      elem = elem.concat(['#multicastIp', '#multicastPort']);
    }
    for (let i = 0; i < elem.length; i++) {
      if (!$(elem[i]).val()) {
        $(elem[i]).addClass('is-invalid')
        return false;
      }
      else {
        $(elem[i]).removeClass('is-invalid')
      } }
    return true;
  }

  onClientUpdate(group) {
    this.flashClientList(group)
  }

  storeAllSettings() {
    this.storage.setItem('serverIp', $('#serverIp').val())
    this.storage.setItem('serverPort', Number($('#serverPort').val()))
    this.storage.setItem('protocol', $('#protocolRadios input:radio:checked').val())
    if(this.protocol === Protocol.multicast) {
      this.storage.setItem('multicastIp', $('#multicastIp').val())
      this.storage.setItem('multicastPort', Number($('#multicastPort').val()))
    }
  }
}

class FileTransferController {
  constructor(module, settings){
    this.module = module;
    this.view = new FileTransferView(this, settings)
    this.module.registerObserver(this.view);
  }

  startServer(ip, port) {
    try{
      this.module.startServer(ip, port);
      this.view.disableStartServer();
    } catch(err){
      console.log(err)
    }
  }

  sendFileByTCP(serverIp, serverPort, filename) {
    this.view.setSendingStatus(true);
    this.module.sendFileByTCP(serverIp, serverPort, filename)
    let notifyMessage = {"action": "start", "data": 
        {"protocol": "tcp", "serverIp": serverIp, "serverPort": serverPort}};
    this.module.notifyAllClient(notifyMessage, "start");
  }

  startHttpServer(serverIp, serverPort) {
    this.module.startHttpServer(serverIp, serverPort)
  }

  startFileTransferServer(serverIp, serverPort) {
    this.module.startFileTransferServer(serverIp, serverPort)
  }
  sendFileByHttp(serverIp, serverPort, filename) {
    this.module.sendFileByHttp(serverIp, serverPort, filename)
    this.view.setSendingStatus(true);
    filename = iconv.decode(filename, 'gbk')
    let notifyMessage = {"action": "start", "data": 
        {"protocol": "http", "serverIp": serverIp, "serverPort": serverPort, "filename": filename}};
    this.module.notifyAllClient(notifyMessage, "start");
  }

  sendFileByMulticast(multicastIp, multicastPort, 
      serverIp, serverPort, filename) {
    this.view.setSendingStatus(true);
    this.module.sendFileByMulticast(multicastIp, multicastPort, 
      serverIp, serverPort, filename)
    let notifyMessage = {"action": "start", "data": 
        {"protocol": "multicast", "serverIp": serverIp, "serverPort": serverPort, 
         "multicastIp": multicastIp, "multicastPort": multicastPort}};
    this.module.notifyAllClient(notifyMessage, "start");
  }

  cancelSend() {
    try{
      this.view.setSendingStatus(false)
      let notifyMessage = {"action": "stop"}
      this.module.notifyAllClient(notifyMessage, "stop");
      this.module.cancelSend();
    } catch(err){ 
      console.log(err)
    }
  }
}

class FileTransferModel {
  constructor() {
    this.fileTransfer = null
    this.httpServer = null
    this.clientGroup = new Array();
    this.observers = new Array();
    this.transferFinishList = new Array();
    this.serverIp = null;
    this.server = null;
    this.discoveryServer = null;
    this.discoveryTimer = null;
    this.httpFileStreamCache = {}
  }

  sendFileByTCP(serverIp, serverPort, filename) {
    ShowLog("SendFileByTCP "+serverIp + ' ' + serverPort + ' ' + iconv.decode(filename, 'gbk'));
    this.transferFinishList = new Array();
    this.fileTransfer.createReliableChannel(serverIp, serverPort);
    try {
      this.fileTransfer.sendFile(filename)
        .then(()=>{})
        .catch((status)=>{ShowLog("Send failed " + status);});
    }catch(e){
      ShowLog(e);
    }
  };

  startFileTransferServer(serverIp, serverPort) {
    this.fileTransfer = new FileTransfer();
  }

  startHttpServer(serverIp, serverPort) {
    if (this.httpServer != null)
      return false
    ShowLog("SendFileByHTTP "+serverIp + ' ' + serverPort);
    this.httpServer = http.createServer((request, response)=>{
      let fileName = request.url.substr(1)
      if (fs.existsSync(fileName)) {
        // send it.
        fs.createReadStream(fileName).pipe(response)
      } else {
        ShowLog("File " + fileName + " not existed!")
        response.writeHead(404, {'Content-Type': 'text/plain'})
        response.write('Error 404. File not found')
        response.end()
      }
    }).listen({
      host: serverIp,
      port: serverPort
    })
    return true
  }

  sendFileByMulticast(multicastIp, multicastPort, 
      serverIp, serverPort, filename) {
    ShowLog("SendFileByMulticast "+multicastIp + ' ' + multicastPort + ' ' + iconv.decode(filename, 'gbk'));
    this.transferFinishList = new Array();
    this.fileTransfer.createUnreliableChannel(multicastIp, multicastPort, serverIp, serverPort);
    try {
      this.fileTransfer.sendFile(filename)
        .then(()=>{
          ShowLog("Send finish");
          this.showTransferFinishResult();
        }).catch((status)=>{ShowLog("Send failed " + status);});
    }catch(e){
      ShowLog(e);
    }
  }

  sendFileByHttp(serverIp, serverPort, filename) {
    ShowLog("SendFileByHttp "+serverIp + ' ' + serverPort + ' ' + iconv.decode(filename, 'gbk'));
    this.transferFinishList = new Array();
  }

  notifyAllClient(notifyMessage, action) {
    ShowLog("Send "+JSON.stringify(notifyMessage))
    for(let idx = 0; idx < this.clientGroup.length; idx++) {
      let client = this.clientGroup[idx];
      client.setEncoding('utf8');
      client.write(JSON.stringify(notifyMessage));
    }

    this.observers.forEach((item, index, array)=>{
      item.onNotifyAllClient(action, this.clientGroup)
    })
  }

  removeClient(client) {
    this.clientGroup.splice(jQuery.inArray(client, this.clientGroup), 1)
    this.observers.forEach((item, index, array)=>{
      item.onClientUpdate(this.clientGroup)
    })
  }

  addClient(client) {
    this.clientGroup.push(client)
    this.observers.forEach((item, index, array)=>{
      item.onClientUpdate(this.clientGroup)
    })
  }

  getClientIndex(client) {
    return this.clientGroup.indexOf(client)
  }

  sendConnectResponse(socket, index) {
    let responseMessage = {"action": "connect", "index": index};
    socket.write(JSON.stringify(responseMessage))
  }

  showTransferFinishResult() {
    let results = Array()
    for (let i =0; i < this.transferFinishList.length; i++) {
      if (this.transferFinishList[i] != 0)
        results.push(this.transferFinishList[i])
    }
    let sum =results.length
    let min = sum == 0 ? 0 : Math.min.apply(null, results)/1000
    let max = sum == 0 ? 0 : Math.max.apply(null, results)/1000
    let ave = sum == 0 ? 0 : results.reduce((a,b)=>a+b)/sum/1000
    ShowLog(sum + " finished. Min=" + min+"s. Max=" + max + "s."+" Ave="+ ave+"s."+" loss="+ (this.transferFinishList.length-results.length))
  }

  ParseMessageFromClient(socket, data) {
    let data_length = data.length
    let start_index = 0
    while(start_index != data_length) {
      let end_index = data.indexOf(';;', start_index)
      let message = JSON.parse(data.substring(start_index, end_index))
      if (message["action"] == "finish") {
        this.transferFinishList.push(message["data"]["duration"]);
        if (this.transferFinishList.length == this.clientGroup.length)
          this.showTransferFinishResult();
      }

      let client_index = this.getClientIndex(socket)
      this.observers.forEach((item, index, array)=>{
        item.onClientResponse(message["action"], client_index)
      })

      start_index = end_index + 2
    }
  }

  startServer(ip, port) {
    //server
    this.serverIp = ip
    this.server = net.createServer((socket)=>{
      ShowLog('connect: ' + socket.remoteAddress + ' : ' + socket.remotePort);
      socket.setNoDelay(true)
      this.addClient(socket);
      this.sendConnectResponse(socket, this.getClientIndex(socket))

      socket.on('data', (data)=>{
        ShowLog(socket.remoteAddress + ' : ' + socket.remotePort + ': ' + data);
        this.ParseMessageFromClient(socket, data)
      });

      socket.on('error',(exception)=>{
        ShowLog('socket error:' + exception);
        this.removeClient(socket);
        socket.end();
      });

      socket.on('close', (data)=>{
        this.removeClient(socket);
        ShowLog('close: ' +
              socket.remoteAddress + ' ' + socket.remotePort);
      });
    }).listen({
      host: ip,
      port: port,
      exclusive: true
    });

    this.server.on('listening', ()=>{
      ShowLog("server listening!");
    });

    this.server.on("error",(exception)=>{
      ShowLog("server error:" + exception);
    });

    this.startDiscoveryServer(defaultDiscoveryAddress, defaultDiscoveryPort);
  }

  startDiscoveryServer(ip, port) {
    this.discoveryServer = dgram.createSocket('udp4')
    this.discoveryServer.bind('0',this.serverIp, ()=>{
      this.discoveryTimer = setInterval(()=>{
        this.sendDiscoveryMessage(ip, port);
      }, 3000)
    });
  }

  sendDiscoveryMessage(destIp, destPort) {
    let discoveryMessage = {"action": "discovery", "data": {"serverIp": this.serverIp, "savePath": "~/Downloads"}}
    discoveryMessage = JSON.stringify(discoveryMessage)
    discoveryMessage = Buffer.from(discoveryMessage);
    console.log("Send "+ discoveryMessage)
    this.discoveryServer.send(discoveryMessage, destPort, destIp, (err)=>{
      if(err) {
        ShowLog("Send discovery message failed, " + err)
        this.discoveryServer.close();
        clearInterval(this.discoveryTimer)
      }
    });
  }

  cancelSend() {
    if (this.fileTransfer) {
      this.fileTransfer.closeFileTransferChannel();
      ShowLog("Close file transfer channel");
    }
  }

  registerObserver(observer) {
    this.observers.push(observer);
  }
}

let fileTransferModule = new FileTransferModel();
let localStorage = new LocalStorage('./setting.cf')
let fileTransferController = new FileTransferController(fileTransferModule, localStorage)