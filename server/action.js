const FileTransfer = require('./ffi/file_transfer.js')
const {ipcRenderer} = require('electron');
const LocalStorage = require('node-localstorage').LocalStorage
const net = require('net')
const dgram = require('dgram');
const iconv = require('iconv-lite')
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

class FileTransferView {
  constructor(controller, storage) {
    this.controller = controller;
    this.storage = storage
    this.serverIp = null
    this.serverPort = null
    this.multicastIp = null 
    this.multicastPort = null 
    this.fileToSend = null
    this.useTCP = true
    if (storage.length != 0) {
      this.serverIp = storage.getItem('serverIp')
      this.serverPort = storage.getItem('serverPort')
      this.multicastIp = storage.getItem('multicastIp')
      this.multicastPort = storage.getItem('multicastPort')
      this.useTCP = storage.getItem('useTCP') == 'false'?false:true
    }
    this.registerStartServer();
    this.registerSendButton();
    this.registerCancelButton();
    this.registerUseTCPCheckbox();

    $('#serverIp').val(this.serverIp)
    $('#serverPort').val(this.serverPort)
    $('#multicastIp').val(this.multicastIp)
    $('#multicastPort').val(this.multicastPort)
    if (this.useTCP) {
      $('#useTCP').attr('checked', 'checked')
    }
    $('#useTCP').change();
    
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
      this.storeAllSettings();
      return false;
    })
  }

  disableStartServer() {
    $('#serverIp').attr('disabled','disabled');
    $('#useTCP').attr('disabled','disabled');
    $('#sendButton').removeAttr('hidden')
    $('#startServerButton').hide()
  }

  registerSendButton() {
    $("#sendButton").on('click', (event)=>{
      if (!this.checkInputs())
        return false;
      this.serverIp = $('#serverIp').val();
      this.serverPort = Number($('#serverPort').val());
      if (this.useTCP) {
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
      if (this.useTCP)
        this.controller.sendFileByTCP(this.serverIp, this.serverPort, tmp);
      else
        this.controller.sendFileByMulticast(
            this.multicastIp, this.multicastPort, this.serverIp, this.serverPort, tmp);
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
    $('#useTCP').change(()=>{
      this.useTCP = $('#useTCP').prop("checked")
      if (this.useTCP) {
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
      clientList.append("<li class='list-group-item'>"+client.remoteAddress + ':' + client.remotePort+'</li>');
    }
    $("#clientCount").html(clientGroup.length);
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
    if (!this.useTCP) {
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
    this.storage.setItem('useTCP', $('#useTCP').prop("checked"))
    if(!this.useTCP) {
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
    this.module.notifyAllClient(serverIp, serverPort, null, null, "start");
  }

  sendFileByMulticast(multicastIp, multicastPort, 
      serverIp, serverPort, filename) {
    this.view.setSendingStatus(true);
    this.module.sendFileByMulticast(multicastIp, multicastPort, 
      serverIp, serverPort, filename)
    this.module.notifyAllClient(serverIp, serverPort, multicastIp, multicastPort, "start");
  }

  cancelSend() {
    try{
      this.view.setSendingStatus(false)
      this.module.notifyAllClient(null, null, null, null, "stop");
      this.module.cancelSend();
    } catch(err){ 
      console.log(err)
    }
  }
}

class FileTransferModel {
  constructor() {
    this.fileTransfer = new FileTransfer();
    this.clientGroup = new Array();
    this.observers = new Array();
    this.transferFinishList = new Array();
    this.serverIp = null;
    this.server = null;
    this.discoveryServer = null;
    this.discoveryTimer = null;
  }

  sendFileByTCP(serverIp, serverPort, filename) {
    ShowLog("SendFileByTCP "+serverIp + ' ' + serverPort + ' ' + iconv.decode(filename, 'gbk'));
    this.transferFinishList = new Array();
    this.fileTransfer.createReliableChannel(serverIp, serverPort);
    try {
      this.fileTransfer.sendFile(filename)
        .then(()=>{setTimeout(()=>{
          ShowLog("Send finish");
          this.showTransferFinishResult();
        }, 3000)})
        .catch((status)=>{ShowLog("Send failed " + status);});
    }catch(e){
      ShowLog(e);
    }
  };

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

  notifyAllClient(serverIp, serverPort, multicastIp, multicastPort, action) {
    let notifyMessage = {"action": action, "data": {"serverIp": serverIp, "serverPort": serverPort, 
                    "multicastIp": multicastIp, "multicastPort": multicastPort}};
    ShowLog("Send "+JSON.stringify(notifyMessage))
    for(let idx = 0; idx < this.clientGroup.length; idx++) {
      let client = this.clientGroup[idx];
      client.setEncoding('utf8');
      client.write(JSON.stringify(notifyMessage));
    }
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

  showTransferFinishResult() {
    let sum = this.transferFinishList.length
    let min = Math.min.apply(null, this.transferFinishList)/1000
    let max = Math.max.apply(null, this.transferFinishList)/1000
    let ave = this.transferFinishList.reduce((a,b)=>a+b)/sum/1000
    ShowLog(sum + " finished. Min=" + min+"s. Max=" + max + "s."+" Ave="+ave+"s.")
  }

  startServer(ip, port) {
    //server
    this.serverIp = ip
    this.server = net.createServer((socket)=>{
      ShowLog('connect: ' + socket.remoteAddress + ' : ' + socket.remotePort);
      socket.setNoDelay(true)
      this.addClient(socket);

      socket.on('data', (data)=>{
        let message = JSON.parse(data)
        if (message["action"] == "finish")
          this.transferFinishList.push(message["data"]["duration"]);
        ShowLog(socket.remoteAddress + ' : ' + socket.remotePort + ': ' + data);
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
    this.fileTransfer.closeFileTransferChannel();
    ShowLog("Close file transfer channel");
  }

  registerObserver(observer) {
    this.observers.push(observer);
  }
}

let fileTransferModule = new FileTransferModel();
let localStorage = new LocalStorage('./setting.cf')
let fileTransferController = new FileTransferController(fileTransferModule, localStorage)