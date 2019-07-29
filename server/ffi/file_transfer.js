
try {
    const ffi = require('ffi');
    const path = require('path')
    const uuid = require('uuid')

    let libpath = path.join(path.resolve(__dirname), "file_transfer_sdk.dll");

    const fileLib = ffi.Library(libpath, {
        'CreateFileTransferChannel': ['pointer', ['string', 'int', 'string', 'int']],
        'CreateReliableFileTransferChannel': ['pointer', ['string', 'int']],
        'SendFile': ['void', ['pointer', 'string', 'pointer']],
        'CloseFileTransferChannel': ['void', ['pointer']],
        'SetZipPath': ['int', ['pointer', 'string']],
        'SetCompression': ['int', ['pointer', 'bool']]
    });

    class FileTransfer {

        createUnreliableChannel(multicast_ip, multicast_port, retransmission_ip, retransmission_port) {
            try {
                console.log('[FileTransfer CreateFileTransferChannel]');
                this.channelObject = fileLib.CreateFileTransferChannel(multicast_ip, multicast_port, retransmission_ip, retransmission_port);
            } catch (e) {
                console.log('[FileTransfer CreateFileTransferChannel error]', e);
            }

        }

        createReliableChannel(serverIp, serverPort) {
            try {
                console.log('[FileTransfer CreateReliableFileTransferChannel]');
                this.channelObject = fileLib.CreateReliableFileTransferChannel(serverIp, serverPort);
            } catch (e) {
                console.log('[FileTransfer CreateReliableFileTransferChannel error]', e);
            }
        }

        sendFile(filePath) {
            const callbackId = uuid()
            const pm = new Promise((resolve, reject) => {
                console.log('[FileTransfer SendFile]');
                global[`sendFileCallback_${callbackId}`] = ffi.Callback('void', ['int'], (statusCode) => {
                    console.log('[FileTransfer SendFile statusCode]', callbackId, statusCode);
                    if (statusCode === 0) {
                        resolve();
                    } else {
                        reject(statusCode);
                    }
                })
                try {
                    fileLib.SendFile(this.channelObject, filePath, global[`sendFileCallback_${callbackId}`])
                } catch (e) {
                    console.log('[FileTransfer SendFile error]', e);
                }
            });
            return pm;
        }

        closeFileTransferChannel() {
            try {
                fileLib.CloseFileTransferChannel(this.channelObject)
            } catch (e) {
                console.log('[FileTransfer CloseFileTransferChannel error]', e);
            }
        }

        setZipPath(fileTempPath) {
            try {
                const result = fileLib.SetZipPath(this.channelObject, fileTempPath);
                return result;
            } catch (e) {
                console.log('[FileTransfer SetZipPath error]', e);
            }
        }

        setCompression(isCompress) {
            try {
                const result = fileLib.SetCompression(this.channelObject, isCompress);
                return result;
            } catch (e) {
                console.log('[FileTransfer SetCompression error]', e);
            }
        }
    }

    module.exports = FileTransfer;
} catch (error) {
    console.log('file transfer error:', error);
    module.exports = {};
}