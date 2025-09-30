import { ConsolePage } from './pages/ConsolePage';
import './App.scss';
import { pdfjs } from 'react-pdf';


pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).toString();

console.log('pdfjs.version=', pdfjs.version);
console.log('import.meta.url=', import.meta.url);
console.log('pdfjs.GlobalWorkerOptions.workerSrc=', pdfjs.GlobalWorkerOptions.workerSrc);

function App() {
  return (
    <div data-component="App">
      <ConsolePage />
    </div>
  );
}

export default App;
