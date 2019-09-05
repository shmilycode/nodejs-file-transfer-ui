const {app, BrowserWindow, ipcMain} = require('electron');
let win;
let windowConfig = {
    width:800,
    height:700
};
function createWindow(){
    win = new BrowserWindow(windowConfig);
    win.loadURL(`file://${__dirname}/index.html`);
    win.setMenuBarVisibility(false);
    win.on('close',() => {
        //回收BrowserWindow对象
        win = null;
    });

    ipcMain.on('open-devtools', (event, args)=>{
      //开启调试工具
      win.webContents.openDevTools({mode:'detach'});
    })
}

app.on('ready',function() {
  createWindow();
});
app.on('window-all-closed',() => {
    app.quit();
});
 
app.on('activate',() => {
    if(win == null){
        createWindow();
    }
})