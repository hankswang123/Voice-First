//import { ConsolePage } from './pages/ConsolePage';
import { DesktopLayout } from './pages/DesktopLayout';
import { TabletLayout } from './pages/TabletLayout';
import './App.scss';
import { pdfjs } from 'react-pdf';
import React, { useEffect, useState } from 'react';
import 'pdfjs-dist/build/pdf.worker.min.mjs';
import { detectDevice } from './utils/detectDevice';

/*
pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).toString();*/

//workerSrc must be has to be set this way when deploying to render.com
pdfjs.GlobalWorkerOptions.workerSrc = `${window.location.origin}/pdf.worker.min.mjs`;

console.log('pdfjs.version=', pdfjs.version);
console.log('import.meta.url=', import.meta.url);
console.log('pdfjs.GlobalWorkerOptions.workerSrc=', pdfjs.GlobalWorkerOptions.workerSrc);

function App() {

  const [deviceType, setDeviceType] = useState<ReturnType<typeof detectDevice>>(detectDevice());

  useEffect(() => {
    const updateDeviceType = () => {
      setDeviceType(detectDevice());
    };

    window.addEventListener('resize', updateDeviceType); // 监听窗口大小变化
    return () => window.removeEventListener('resize', updateDeviceType);
  }, []);  

  return (
    <div data-component="App">
      {/*<ConsolePage />*/}
      {deviceType.isDesktop && <DesktopLayout />}
      {deviceType.isTablet && <TabletLayout />}
    </div>
  );
}

export default App;
