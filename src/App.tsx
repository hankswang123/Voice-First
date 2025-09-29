import { ConsolePage } from './pages/ConsolePage';
import './App.scss';
import { pdfjs } from 'react-pdf';

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).toString();

function App() {
  return (
    <div data-component="App">
      <ConsolePage />
    </div>
  );
}

export default App;
