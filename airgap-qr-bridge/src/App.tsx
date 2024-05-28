// Styles
import "./App.css";

// React
import { useState, useEffect } from "react";
// Components
import QrReader from "./components/QrReader";
import QRCode from "qrcode";
import CryptoJS from 'crypto-js';


function App() {
  const [openQr, setOpenQr] = useState<boolean>(false);
  const [text, setText] = useState("Your data here...");
  const [textChecksum, setTextChecksum] = useState("");
  const [qrCodeUrl, setQrCodeUrl] = useState("");

  const generateQR = async () => {
    try {
      const url = await QRCode.toDataURL(text);
      setQrCodeUrl(url);
    } catch (error) {
      console.error("Error generating QR code: ", error);
    }
  };

  useEffect(() => {
    if (text === "" || text === undefined) {
      setQrCodeUrl("");
    }
    
    setTextChecksum(CryptoJS.SHA256(text).toString(CryptoJS.enc.Hex));
    
  }, [text])
  

  return (
    <div className="container pl-4 pt-4">
      <h1 className="text-3xl font-bold pb-2">Air-gap QR Data Transfer</h1>
      <div className="grid grid-cols-2 gap-4">
      

        <div className="bg-gray-100 border px-4 py-2">
        <button className="border bg-black text-white pl-4 pr-4 pt-2 pb-2" onClick={() => setOpenQr(!openQr)}>
            {openQr ? "Close" : "Open"} QR Scanner
          </button>
        </div>
        <div className="bg-gray-100 border px-4 py-2"></div>

        {openQr && <QrReader />}
        <div className="bg-gray-100 border px-4 py-2">
          <div>
            <div>
              <button className="border bg-black text-white pl-4 pr-4 pt-2 pb-2 mb-2" onClick={generateQR}>
                Generate QR
              </button>
              <button className="ml-2 border bg-black text-white pl-4 pr-4 pt-2 pb-2 mb-2" onClick={() => setText("")}>
                Clear output
              </button>
            </div>
            <div>
              <textarea
                className="w-full h-32 p-2 border border-gray-300 rounded"
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="Enter text"
              ></textarea>
              <div className="text-xs">
                Checksum: {textChecksum}
              </div>
         
            </div>
          </div>
        </div>
        <div className="bg-gray-100 border px-4 py-2">
          <h1></h1>
          {qrCodeUrl && <img className="w-full" src={qrCodeUrl} alt="Generated QR Code" />}
        </div>
      </div>
    </div>
  );
}

export default App;
