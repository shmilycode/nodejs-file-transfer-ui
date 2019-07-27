const FileTransfer = require('./ffi/file_transfer.js')
let clientGroup = new Array();
let logMessage = '';

function ShowLog(message) {
  console.log(message);
  logMessage = logMessage + message + '\n';
  $("#outputArea").val(logMessage);
  $("#outputArea").scrollTop($("#outputArea").prop("scrollHeight"));
}

function FlashClientList() {
  clientList = $("#clientList")
  clientList.empty()
  for(idx = 0; idx < clientGroup.length; idx++) {
    client = clientGroup[idx]
    clientList.append("<li class='list-group-item'>"+client.remoteAddress + ':' + client.remotePort+'</li>');
  }
}

function NotifyAllClient(serverIp, serverPort, multicastIp, multicastPort) {
  notifyMessage = {"action": "start", "data": {"serverIp": serverIp, "serverPort": serverPort, 
                  "multicastIp": multicastIp, "multicastPort": multicastPort}};
  ShowLog("Send "+JSON.stringify(notifyMessage))
  for(idx = 0; idx < clientGroup.length; idx++) {
    client = clientGroup[idx];
    client.setEncoding('utf8');
    client.write(JSON.stringify(notifyMessage));
  }
}

let fileTransfer;
function sendFileByTCP(serverIp, serverPort, filename) {
  ShowLog("SendFileByTCP "+serverIp + ' ' + serverPort + ' ' + filename);
  fileTransfer = new FileTransfer();
  fileTransfer.createReliableChannel(serverIp, serverPort);
  try {
    fileTransfer.sendFile(filename)
      .then(function(){ShowLog("Send finish");})
      .catch(function(status) {ShowLog("Send failed " + status);});
  }catch(e){
    ShowLog(e);
  }
};

function SetSendingStatus(status) {
  if (status) {
    $('#sendButton').hide();
    $("#cancelButton").removeAttr("hidden"); 
    $('#cancelButton').show();
  } else {
    $('#sendButton').show();
    $('#cancelButton').hide();
  }
}

function CheckInputs() {
  elem = ['#serverIp', '#serverPort', '#inputFile'];
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

//server
const net = require('net')
var server = net.createServer(function(socket){
  console.log('connect: ' + socket.remoteAddress + ' : ' + socket.remotePort);
  clientGroup.push(socket)
  FlashClientList();
  socket.on('data', function(data) {
    ShowLog('recv: ' + data);
  });

  socket.on('error',function(exception){
    ShowLog('socket error:' + exception);
    clientGroup.splice(jQuery.inArray(socket, clientGroup), 1);
    FlashClientList();
    socket.end();
  });

  socket.on('close', function(data) {
    clientGroup.splice(jQuery.inArray(socket, clientGroup), 1);
    FlashClientList();
    ShowLog('close: ' +
          socket.remoteAddress + ' ' + socket.remotePort);
  });
}).listen(6669);

server.on('listening', function(){
  ShowLog("server listening!");
});

server.on("error",function(exception){
  ShowLog("server error:" + exception);
});

// Add the following code if you want the name of the file appear on select
$(".custom-file-input").on("change", function() {
  var fileName = $(this).val().split("\\").pop();
  $(this).siblings(".custom-file-label").addClass("selected").html(fileName);
});

let serverIp;
let serverPort;
let multicastIp;
let multicastPort;
$("#sendButton").on('click', function() {
  if (!CheckInputs())
    return false;
  serverIp = $('#serverIp').val();
  serverPort = Number($('#serverPort').val());
  multicastIp = $('#multicastIp').val();
  multicastPort = Number($('multicastPort').val());
  fileToSend = $('#inputFile').prop('files')[0].path
  sendFileByTCP(serverIp, serverPort, fileToSend);
  NotifyAllClient(serverIp, serverPort, multicastIp, multicastPort);
  console.log("on click: "+serverIp+serverPort+multicastIp+multicastPort)
  SetSendingStatus(true);
  return false;
})
$("#cancelButton").on('click', function() {
  SetSendingStatus(false)
  fileTransfer.closeFileTransferChannel();
  ShowLog("Close file transfer channel");
  return false;
});