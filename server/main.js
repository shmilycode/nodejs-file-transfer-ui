const {app, BrowserWindow} = require('electron');
let win;
let windowConfig = {
    width:800,
    height:600
};
function createWindow(){
    win = new BrowserWindow(windowConfig);
    win.loadURL(`file://${__dirname}/index.html`);
    //开启调试工具
    win.webContents.openDevTools();
    win.setMenuBarVisibility(false);
    win.on('close',() => {
        //回收BrowserWindow对象
        win = null;
    });
}
 
app.on('ready',createWindow);
app.on('window-all-closed',() => {
    app.quit();
});
 
app.on('activate',() => {
    if(win == null){
        createWindow();
    }
})