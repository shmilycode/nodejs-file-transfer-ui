function startStreamOutput(e) 
{
  receiveFile();
}

function closeStreamOutput() {
  sendFile();
}

function ReceiveUnreliable(serverIp, serverPort, multicastIp, multicastPort, path) {
  ShowLog("Start multicast receive.");
  if (globalChannelId != -1) {
    ShowLog("Error, globalChannelId != -1");
    return;
  }
  chrome.seewoos.fileTransfer.createFileTransferChannel(multicastIp, multicastPort, serverIp, serverPort, function(channelId){
   if(channelId != -1) {
      globalChannelId = channelId;
      ShowLog("Open channel success!!");
      chrome.seewoos.fileTransfer.receiveFile(channelId, path, function(status){
        if (status != 0) {
            ShowLog("Receive file failed, error code: "+status);
        } else {
            ShowLog("Receive file success!!");
        }
        chrome.seewoos.fileTransfer.closeFileTransferChannel(channelId, function(status){
            ShowLog("Close channel: "+status);
        });
      });
   } else {
     ShowLog("Open channel failed!!");
   }
  })
};

function str2ab(str) {
  var buf = new ArrayBuffer(str.length); // 2 bytes for each char
  var bufView = new Uint8Array(buf);
  for (var i=0, strLen=str.length; i < strLen; i++) {
    bufView[i] = str.charCodeAt(i);
  }
  return buf;
}

function ReceiveReliable(serverIp, serverPort, path) {
  ShowLog("Start tcp receive.");
  if (globalChannelId != -1) {
    ShowLog("Error, globalChannelId != -1");
    return;
  }
  chrome.seewoos.fileTransfer.createReliableFileTransferChannel(serverIp, serverPort, function(channelId){
   if(channelId != -1) {
      globalChannelId = channelId;
      ShowLog("Open channel success!!");
      chrome.seewoos.fileTransfer.receiveFile(channelId, path, function(status){
        if (status != 0) {
            ShowLog("Receive file failed, error code: "+status);
        } else {
            ShowLog("Receive file success!!");
            chrome.sockets.tcp.send(client, str2ab("I'm OK!"), (info)=>{
              ShowLog("Notify server result " + info.resultCode);
            });
        }
        closeChannel();
      });
   } else {
     ShowLog("Open channel failed!!");
   }
  })
};

function closeChannel() {
  if (globalChannelId == -1)
    return;
  chrome.seewoos.fileTransfer.closeFileTransferChannel(globalChannelId, function(status){
      ShowLog("CloseChannel status =  " + status);
      globalChannelId = -1;
  });
};

function afterCloseWindow() {
  closeChannel();
  chrome.sockets.tcp.close(client, function(){
    ShowLog("Client has been closed.");
  });
}

function CheckInputs() {
  elem = ['#serverIp', '#pathToSave'];
  for (i = 0; i < elem.length; i++) {
    if (!$(elem[i]).val()) {
      $(elem[i]).addClass('is-invalid')
      return false;
    }
    else {
      $(elem[i]).removeClass('is-invalid')
    }
  }
  return true;
}

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

let logMessage = '';
function ShowLog(message) {
  message = new Date().Format("hh:mm:ss.S") + message;
  logMessage = logMessage + message + '\n';
  console.log(message);
  $("#outputArea").val(logMessage);
  $("#outputArea").scrollTop($("#outputArea").prop("scrollHeight"));
}

let heartbeatTimer;
let heartbeatPeriod=4000
let heartbeatResponsePeriod=2000
function sendHeartbeat() {
  console.log("Send heartbeat");
  message = str2ab("hb")
  chrome.sockets.tcp.send(client, message, (info)=>{
    if (info.resultCode < 0) {
      ShowLog("Send heartbeat failed!!");  
    }
  });
  heartbeatTimer = setTimeout(heartbeatTimeoutHandler, heartbeatResponsePeriod)
}

function heartbeatTimeoutHandler() {
  ShowLog("Heartbeat timeout, server may have close!!");
  chrome.sockets.tcp.close(client, function(){
    ShowLog("Client has been closed.");
  });
}

chrome.sockets.tcp.onReceive.addListener(function(info) {
  if (info.resultCode < 0)
    ShowLog("Recv failed!!!!!!!!");
  if (info.socketId != client)
    return;
  console.log(info)
  message = String.fromCharCode.apply(null, new Uint8Array(info.data));
  message = JSON.parse(message);
  if (message["action"] == "start") {
    ShowLog("recv " + message)
    transferServerIp = message["data"]["serverIp"]
    transferServerPort = message["data"]["serverPort"]
    multicastIp = message["data"]["multicastIp"]
    multicastPort = message["data"]["multicastPort"]
    path = $("#pathToSave").val()
    if (multicastIp) {
      ReceiveUnreliable(transferServerIp, transferServerPort, multicastIp, multicastPort, path);
    } else {
      ReceiveReliable(transferServerIp, transferServerPort, path);
    }
  } else if (message["action"] == "heartbeat") {
    console.log("Clear timeout for receive data");
    clearTimeout(heartbeatTimer)
    heartbeatTimer = setTimeout(sendHeartbeat, heartbeatPeriod);
  }
});

chrome.sockets.tcp.onReceiveError.addListener(function(info) {
  clearTimeout(heartbeatTimer)
  ShowLog("client " + info.socketId + " disconnect")
  $("#connectButton").show();
});

$("#chooseFolderButton").on("click", function() {
  chrome.fileSystem.chooseEntry({type: "openDirectory"}, function(entry){
    chrome.fileSystem.getDisplayPath(entry, function(path) {
      ShowLog("Save to path "+path);
      $("#pathToSave").val(path);
      CheckInputs();
    });
  });
});

$("#connectButton").on('click', function(){
  if (!CheckInputs())
    return false;
  serverIp = $('#serverIp').val();
  pathToSave = $("#pathToSave").val()
  serverPort = 6669;

  ShowLog("Try connecting to " +serverIp + ":" + serverPort); 
  chrome.storage.local.set({serverIp: serverIp, pathToSave: pathToSave}, ()=>{})
  chrome.sockets.tcp.create({}, function(createInfo){
    client = createInfo.socketId;
    chrome.sockets.tcp.connect(client, serverIp, serverPort, 
      function(result){
        ShowLog("Socket " + client + " connection result: "+result);
        if (result == 0) {
          $("#connectButton").hide();
          // heartbeat timer
          heartbeatTimer = setTimeout(sendHeartbeat, heartbeatPeriod);
        } else {
          chrome.sockets.tcp.close(client, (info)=>{});
        }
      });
  });
  return false;
}); 
 
$("#cancelButton").on('click', function() {
  closeChannel();
  return false;
});

chrome.storage.local.get(['serverIp', 'pathToSave'], (result)=>{
  $('#serverIp').val(result.serverIp)
  $('#pathToSave').val(result.pathToSave)
});