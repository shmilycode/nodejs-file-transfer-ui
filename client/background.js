let defaultDiscoveryAddress ="239.6.6.6"
let defaultDiscoveryPort = 41234

chrome.app.runtime.onLaunched.addListener(function () {
  clientWin = chrome.app.window.create('page.html', {
    id: "StreamHubTestID",
    bounds: {
      width: 800,
      height: 600
    }
  }, function (mainWindow) {
    mainWindow.contentWindow.globalModel = new FileTransferClientModel();
    mainWindow.onClosed.addListener(function () {
      mainWindow.contentWindow.globalModel.closeConnection()
      mainWindow.contentWindow.globalModel.closeChannel()
    });
  });
});

chrome.app.window.onClosed.addListener(function () {
  console.log("test");
});

chrome.runtime.onSuspend.addListener(function() {
  console.log("test");
});

class FileTransferClientModel{
  constructor(){
    this.channelId = -1;
    this.httpRequest = null
    this.heartbeatPeriod=30
    this.observers = new Array();
    this.connection = null;
    this.pathToSave = null;
    this.discoveryClient = null;
    this.connectionRegister();
    this.startDiscoveryClient(defaultDiscoveryAddress, defaultDiscoveryPort)
  }

  setPathToSave(path) {
    this.pathToSave = path;
  }

  ShowLog(message) {
    this.observers.forEach((item, index, array)=>{
        item.onShowLog(message)})
  }

  createConnection(serverIp, serverPort) {
    chrome.sockets.tcp.create({}, (createInfo)=>{
      this.connection = createInfo.socketId;
      chrome.sockets.tcp.connect(this.connection, serverIp, serverPort, 
        (result)=>{
          this.ShowLog("Socket " + this.connection + " connection result: "+result);
          if (result == 0) {
            chrome.sockets.tcp.setKeepAlive(this.connection, true, this.heartbeatPeriod, (result)=>{
              this.observers.forEach((item, index, array)=>{item.onConnectionCreated()})
            });
          } else {
            chrome.sockets.tcp.close(this.connection, (info)=>{});
          }
        });
    });
  }

  closeConnection() {
    if (this.connection != null)
      chrome.sockets.tcp.close(this.connection);
    if (this.discoveryClient != null)
      chrome.sockets.udp.close(this.discoveryClient);
  }

  transferTrace() {
    this.ShowLog("Transfer trace start")
    this.transferStartTime = new Date().getTime()
  }

  getTransferDuration() {
    let transferEndTime = new Date().getTime()
    return transferEndTime - this.transferStartTime
  }

  notifyServer(message) {
    this.ShowLog(message);
    message += ";;"
    chrome.sockets.tcp.send(this.connection, this.str2ab(message), (info)=>{
      this.ShowLog("Notify server result " + info.resultCode);
    });
  }

  ReceiveUnreliable(serverIp, serverPort, multicastIp, multicastPort, path) {
    this.ShowLog("Start multicast receive.");
    if (this.channelId != -1) {
      this.ShowLog("Error, channel != -1");
      return;
    }
    this.transferTrace();
    chrome.seewoos.fileTransfer.createFileTransferChannel(multicastIp, multicastPort, serverIp, serverPort, (channelId)=>{
     if(channelId != -1) {
        this.channelId = channelId;
        this.ShowLog("Open channel success!!");
        this.observers.forEach((item, index, array)=>{item.onReceiveStart()})
        chrome.seewoos.fileTransfer.receiveFile(channelId, path, (status)=>{
          if (status != 0) {
              this.ShowLog("Receive file failed, error code: "+status);
          } else {
              let result = {"action": "finish", "data":{"duration": this.getTransferDuration()}}
              this.notifyServer(JSON.stringify(result))
          }
          this.closeChannel();
          this.observers.forEach((item, index, array)=>{item.onReceiveFinish()})
        });
     } else {
       this.ShowLog("Open channel failed!!");
     }
    })
  }

  ReceiveReliable(serverIp, serverPort, path) {
    this.ShowLog("Start tcp receive.");
    if (this.channelId != -1) {
      this.ShowLog("Error, channelId != -1");
      return;
    }
    this.transferTrace();
    chrome.seewoos.fileTransfer.createReliableFileTransferChannel(serverIp, serverPort, (channelId)=>{
     if(channelId != -1) {
        this.channelId = channelId;
        this.ShowLog("Open channel success!!");
        chrome.seewoos.fileTransfer.receiveFile(channelId, path, (status)=>{
          if (status != 0) {
              this.ShowLog("Receive file failed, error code: "+status);
          } else {
              let result = {"action": "finish", "data":{"duration": this.getTransferDuration()}}
              this.notifyServer(JSON.stringify(result))
          }
          this.closeChannel();
        });
     } else {
       this.ShowLog("Open channel failed!!");
     }
    })
  }

  ReceiveFromHttp(serverIp, serverPort, filename, path) {
    this.ShowLog("Start http client!")
    let xhr = new XMLHttpRequest();
    let url = "http://" + serverIp + ":" + serverPort + "/" + filename
    this.ShowLog("Get " + url)
    this.transferTrace();
    var requestContent = {
           timeout: 60000, // try 60s
           url: url,
           type: "GET",
      success: (data)=>{
        this.ShowLog("Receive " + data.length)
        let result = {"action": "finish", "data":{"duration": this.getTransferDuration()}}
        this.notifyServer(JSON.stringify(result))
      },
      error:(XMLHttpRequest, textStatus, errorThrown)=>{
        this.ShowLog("Send http request failed! " +  textStatus + ":" + errorThrown)
        let result = {"action": "finish", "data":{"duration": 0}}
        this.notifyServer(JSON.stringify(result))
      }
    };
    this.httpRequest = $.ajax(requestContent)
  }

  str2ab(str) {
    var buf = new ArrayBuffer(str.length); // 2 bytes for each char
    var bufView = new Uint8Array(buf);
    for (var i=0, strLen=str.length; i < strLen; i++) {
      bufView[i] = str.charCodeAt(i);
    }
    return buf;
  }

  closeChannel() {
    if (this.channelId == -1)
      return;
    chrome.seewoos.fileTransfer.closeFileTransferChannel(this.channelId, (status)=>{
        console.log("CloseChannel status =  " + status);
        this.channelId = -1;
    });
  };

  connectionRegister(){
    chrome.sockets.tcp.onReceive.addListener((info)=>{
      if (info.resultCode < 0)
        this.ShowLog("Recv failed!!!!!!!!");
      if (info.socketId != this.connection)
        return;
      console.log(info)
      let message = String.fromCharCode.apply(null, new Uint8Array(info.data));
      message = JSON.parse(message);
      if (message["action"] == "connect") {
        this.clientIndex = message["index"]
        this.observers.forEach((item, index, array)=>{
          item.onClientIndexUpdate(this.clientIndex)
        })
      } else if (message["action"] == "start") {
        this.handleActionStart(message, this.pathToSave);
      } else if (message["action"] == "stop") {
        this.handleActionStop(message)
      }
    });

    chrome.sockets.tcp.onReceiveError.addListener((info)=>{
      this.ShowLog("client " + info.socketId + " disconnect")
      this.observers.forEach((item, index, array)=>{
        item.onConnectionReceiveError();
      })
    });
  }

  handleActionStart(message, pathToSave) {
    this.ShowLog("recv " + message)
    let protocol = message["data"]["protocol"]
    let transferServerIp = message["data"]["serverIp"]
    let transferServerPort = message["data"]["serverPort"]
    if (protocol == "multicast") {
      let multicastIp = message["data"]["multicastIp"]
      let multicastPort = message["data"]["multicastPort"]
        this.ReceiveUnreliable(transferServerIp, transferServerPort, multicastIp, multicastPort, pathToSave);
    } else if (protocol == "tcp") {
      this.ReceiveReliable(transferServerIp, transferServerPort, pathToSave);
    } else if (protocol == "http"){
      let filename = message["data"]["filename"]
      this.ReceiveFromHttp(transferServerIp, transferServerPort, filename, pathToSave)
    } else {
      this.ShowLog("Unknown protocol "+protocol)
      return
    }
    let result = {"action": "start_response"}
    this.notifyServer(JSON.stringify(result))
  }

  handleActionStop(message) {
    this.closeChannel();
    if (this.httpRequest != null) {
      this.httpRequest.abort()
      this.httpRequest = null
    }
    this.observers.forEach((item, index, array)=>{item.onReceiveFinish()})
    let result = {"action": "stop_response"}
    this.notifyServer(JSON.stringify(result))
  }

  registerObserver(observer) {
    this.observers.push(observer);
  }

  startDiscoveryClient(ip, port) {
    chrome.sockets.udp.create({}, (createInfo)=>{
      if (this.discoveryClient) {
        this.ShowLog("Can't to start discovery client twice!")
        return;
      }
      var socketId = createInfo.socketId;
      chrome.sockets.udp.bind(socketId, "0.0.0.0", port, (result)=>{
        if (result != 0) {
          chrome.sockets.udp.close(socketId, ()=>{
            this.ShowLog("Fail to start discovery client, ", result);
          });
        } else {
          chrome.sockets.udp.joinGroup(socketId, ip, (result)=>{
            if (result != 0) {
              chrome.sockets.udp.close(socketId, ()=>{
                this.ShowLog("Error on joinGroup(): ", result);
              });
            } else {
              this.discoveryClient = socketId
              chrome.sockets.udp.onReceive.addListener((info)=>{
                  this.onDiscoveryServerFound(info)});
              chrome.sockets.udp.onReceiveError.addListener((socketId, resultCode)=>{
                  this.onDiscoveryClientError(socketId, resultCode)});
            }
          })
        }
      })
    })
  }

  onDiscoveryServerFound(info) {
    if (info.socketId != this.discoveryClient)
      return;
    let message = String.fromCharCode.apply(null, new Uint8Array(info.data));
    message = JSON.parse(message);
    if (message["action"] == "discovery") {
      let serverIp = message["data"]["serverIp"]
      let savePath = message["data"]["savePath"]
      this.observers.forEach((item, index, array)=>{item.onServerFound(serverIp, savePath)})
    } else {
      console.log("discovery client receive unknown message!")
    }
  }

  onDiscoveryClientError(id, code) {
    if (id == this.discoveryClient)
      this.ShowLog("Discovery client error happened, " + code)
  }

}
