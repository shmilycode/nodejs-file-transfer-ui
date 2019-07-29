let globalChannelId = -1;

chrome.app.runtime.onLaunched.addListener(function () {
  clientWin = chrome.app.window.create('page.html', {
    id: "StreamHubTestID",
    bounds: {
      width: 800,
      height: 600
    }
  }, function (mainWindow) {
    mainWindow.contentWindow.client = -1;
    mainWindow.contentWindow.globalChannelId = -1;
    mainWindow.onClosed.addListener(function () {
      chrome.sockets.tcp.close(mainWindow.contentWindow.client, function(){});
      if (mainWindow.contentWindow.globalChannelId != -1) {
        chrome.seewoos.fileTransfer.closeFileTransferChannel(globalChannelId, function(status){
            ShowLog("CloseChannel status =  " + status);
            globalChannelId = -1;
        });
      }
    });

  });
});

chrome.app.window.onClosed.addListener(function () {
  console.log("test");
});

chrome.runtime.onSuspend.addListener(function() {
  console.log("test");
});

