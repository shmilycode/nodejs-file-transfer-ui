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
  logMessage = logMessage + message + '\n';
  console.log(message);
  $("#outputArea").val(logMessage);
  $("#outputArea").scrollTop($("#outputArea").prop("scrollHeight"));
}


class FileTransferClientView {
  constructor(settings, controller) {
    this.serverIp = settings.serverIp
    this.pathToSave = settings.pathToSave
    this.controller = controller
    this.automaticGetServerIp = settings.automaticGetServerIp
    if (this.automaticGetServerIp == null)
      this.automaticGetServerIp = true
    this.registerChooseFolderButton()
    this.registerConnectButton()
    this.registerCancelButton()
    this.registerAutoServerIpCheckbox()
    $('#serverIp').val(this.serverIp)
    $('#pathToSave').val(this.pathToSave)
    this.controller.setPathToSave(this.pathToSave)
    if (this.automaticGetServerIp) {
      $('#automaticGetServerIp').attr('checked', 'checked')
    }
    $('#automaticGetServerIp').change()
  }

  CheckInputs() {
    let elem = ['#serverIp', '#pathToSave'];
    for (let i = 0; i < elem.length; i++) {
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

  onShowLog(message) {
    ShowLog(message)
  }

  onConnectionCreated() {
    $("#connectButton").hide();
    $('#serverIp').attr('disabled', 'disabled')
    $('#pathToSave').attr('disabled', 'disabled')
    $('#chooseFolderButton').attr('disabled', 'disabled')
    $('#automaticGetServerIp').attr('disabled', 'disabled')
  }

  onConnectionReceiveError() {
    $("#connectButton").show();
    $('#serverIp').removeAttr('disabled')
    $('#pathToSave').removeAttr('disabled')
    $('#chooseFolderButton').removeAttr('disabled')
    $('#automaticGetServerIp').removeAttr('disabled')
  }

  onServerFound(serverIp) {
    if (this.automaticGetServerIp && $('#connectButton').is(':visible')) {
      if (this.serverIp == serverIp &&
          $('#serverIp').val() == serverIp)
        return;
      this.serverIp = serverIp;
      $('#serverIp').val(serverIp)
    }
  }

  registerChooseFolderButton() {
    $("#chooseFolderButton").on("click", ()=>{
      chrome.fileSystem.chooseEntry({type: "openDirectory"}, (entry)=>{
        chrome.fileSystem.getDisplayPath(entry, (path)=>{
          ShowLog("Save to path "+path);
          $("#pathToSave").val(path);
          this.controller.setPathToSave(path)
          this.CheckInputs();
        });
      });
    });
  }

  registerConnectButton() {
    $("#connectButton").on('click', ()=>{
      if (!this.CheckInputs())
        return false;
      this.serverIp = $('#serverIp').val();
      this.pathToSave = $("#pathToSave").val()
      this.serverPort = 6669;
      ShowLog("Try connecting to " +this.serverIp + ":" + this.serverPort); 
      chrome.storage.local.set({
        serverIp: this.serverIp, 
        pathToSave: this.pathToSave, 
        automaticGetServerIp: this.automaticGetServerIp}, ()=>{})
      this.controller.createConnection(this.serverIp, this.serverPort);
      return false;
    }); 
  }

  registerCancelButton() {
    $("#cancelButton").on('click', ()=>{
      this.controller.closeChannel();
      return false;
    });
  }

  registerAutoServerIpCheckbox() {
    $('#automaticGetServerIp').change(()=>{
      this.automaticGetServerIp = $('#automaticGetServerIp').prop("checked")
      return false;
    })
  }

}

class FileTransferClientController {
  constructor(model) {
    this.model =model 
  }

  async init() {
    try{
      this.fileTransferClientView = await this.initializeClientView();
      this.model.registerObserver(this.fileTransferClientView)
    }catch(err) {
      ShowLog(err)
    }
  }

  initializeClientView() {
    let pm = new Promise((resolve, reject)=>{
      chrome.storage.local.get(['serverIp', 'pathToSave', 'automaticGetServerIp'], 
      (result)=>{
        let fileTransferClientView = 
          new FileTransferClientView(result, this)
        resolve(fileTransferClientView)
      });
    })
    return pm
  }

  createConnection(serverIp, serverPort) {
    try{
      this.model.createConnection(serverIp, serverPort)
    } catch(err){
      ShowLog(err)
    }

  }
  closeChannel() {
    try{
      this.model.closeChannel();
    } catch(err) {
      ShowLog(err)
    }
  }

  setPathToSave(path) {
    this.model.setPathToSave(path)
  }
}

let controller = new FileTransferClientController(globalModel)
controller.init()
