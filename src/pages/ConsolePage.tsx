/**
 * Running a local relay server will allow you to hide your API key
 * and run custom logic on the server
 *
 * Set the local relay server address to:
 * REACT_APP_LOCAL_RELAY_SERVER_URL=http://localhost:8081
 *
 * This will also require you to set OPENAI_API_KEY= in a `.env` file
 * You can run it with `npm run relay`, in parallel with `npm start`
 */
// Determine relay server URL: use explicit env var if provided, otherwise in production
// derive from current origin + /realtime (attached to Express). During CRA dev, keep blank
// so that direct OpenAI (dangerouslyAllowAPIKeyInBrowser) path still functions if desired.
let LOCAL_RELAY_SERVER_URL: string = process.env.REACT_APP_LOCAL_RELAY_SERVER_URL || '';
if (!LOCAL_RELAY_SERVER_URL) {
  const isBrowser = typeof window !== 'undefined';
  if (isBrowser) {
    const isDev = !process.env.NODE_ENV || process.env.NODE_ENV === 'development';
    if (!isDev) {
      LOCAL_RELAY_SERVER_URL = `${window.location.origin.replace(/^http/, 'ws')}/realtime`;
    }
  }
}

import React, { useEffect, useRef, useCallback, useState } from 'react';

import { RealtimeClient } from '@hankswang123/realtime-api-beta';
import { ItemType } from '@hankswang123/realtime-api-beta/dist/lib/client.js';

import { WavRecorder, WavStreamPlayer } from '../lib/wavetools/index.js';

import {Layers, HelpCircle, AlignCenter, Key, Layout, Book, BookOpen, TrendingUp, X, Zap, Edit, Edit2, Play, Pause, Mic, MicOff, Plus, Minus, ArrowLeft, ArrowRight, Settings, Repeat, SkipBack, SkipForward, Globe, UserPlus, ZoomOut, ZoomIn, User, Volume } from 'react-feather';

import './style/ConsolePage.scss';

import { magzines, fetchKeywords, transformAudioScripts, buildInstructions, genKeywords, tts_voice, getFlashcards } from '../utils/app_util.js';
import Chat, {openai} from '../components/chat/Chat';
import CountdownTimer from '../components/countdowntimer/CountdownTimer';
import Flashcards from "../components/flashcards/Flashcards";
import { Button } from '../components/button/Button';

import { Document, Page } from 'react-pdf';
//import 'react-pdf/dist/esm/Page/AnnotationLayer.css';
//import 'react-pdf/dist/esm/Page/TextLayer.css';
import './style/react-pdf/AnnotationLayer.css';
import './style/react-pdf/TextLayer.css';
import html2canvas from 'html2canvas';

/**
 * Type for all event logs
 */
interface RealtimeEvent {
  time: string;
  source: 'client' | 'server';
  count?: number;
  event: { [key: string]: any };
}

export function ConsolePage() {
  /**
   * Ask user for API Key
   * If we're using the local relay server, we don't need this
   */
  /*
  const apiKey = LOCAL_RELAY_SERVER_URL
    ? ''
    : localStorage.getItem('tmp::voice_api_key') ||
      prompt('OpenAI API Key') ||
      '';
  if (apiKey !== '') {
    localStorage.setItem('tmp::voice_api_key', apiKey);
  }*/

  //Timer of SearchBox animation effect for Youtube Video
  let animation: NodeJS.Timeout;    

  //Comment out orinial API Key Prompt and 
  //Postpone the Prompt to first unmute click(will enable audio copilot)
  const apiKey = '';

  /**
   * Instantiate:
   * - WavRecorder (speech input)
   * - WavStreamPlayer (speech output)
   * - RealtimeClient (API client)
   */
  const wavRecorderRef = useRef<WavRecorder>(
    new WavRecorder({ sampleRate: 24000 })
  );
  const wavStreamPlayerRef = useRef<WavStreamPlayer>(
    new WavStreamPlayer({ sampleRate: 24000 })
  );

  const clientRef = useRef( new RealtimeClient(
      LOCAL_RELAY_SERVER_URL
        ? { url: LOCAL_RELAY_SERVER_URL }
        : {
            apiKey: apiKey,
            dangerouslyAllowAPIKeyInBrowser: true,
          }
    ) ); 

  /**
   * References for
   * - Rendering audio visualization (canvas)
   * - Autoscrolling event logs
   * - Timing delta for event log displays
   */
  const eventsScrollHeightRef = useRef(0);
  const eventsScrollRef = useRef<HTMLDivElement>(null);
  const startTimeRef = useRef<string>(new Date().toISOString());

  /**
   * References for
   * - Chat component which will be used to display voice conversations
   */
  const chatRef = useRef(null);  

  /**
   * All of our variables for displaying application state
   * - items are all conversation items (dialog)
   */
  const [items, setItems] = useState<ItemType[]>([]);
  const [realtimeEvents, setRealtimeEvents] = useState<RealtimeEvent[]>([]);
  const [isConnected, setIsConnected] = useState(false);

  //hanks - Implementation of audio copilot
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(true);
  const [progress, setProgress] = useState(0);
  const [captionWidth, setCaptionWidth] = useState(100);
  const [playbackRate, setPlaybackRate] = useState(1.0); // State to control playback speed
  const [playbackVolume, setPlaybackVolume] = useState(0.75); // State to control playback speed
  const [rtVoice, setRtVoice] = useState<'ash' | 'alloy' | 'ballad' | 'coral' | 'echo' | 'sage' | 'shimmer' | 'verse'>('alloy'); // State to control realtime voice speed
  const [keyword, setKeyword] = useState(''); // State to store keyword
  const [isHidden, setIsHidden] = useState(true); // State to control audio/video visibility
  const [isDragging, setIsDragging] = useState(false);
  const [isProgressDragging, setIsProgressDragging] = useState(false);
  const [isSplitterDragging, setIsSplitterDragging] = useState(false);
  const [currentCaption, setCurrentCaption] = useState(''); // State to display current caption
  const [totalDuration, setTotalDuration] = useState(0); // State to store total duration
  const [currentTime, setCurrentTime] = useState(0); // State to store current play time
  const [isCaptionVisible, setIsCaptionVisible] = useState(false); // State to manage caption visibility
  const [showTranslation, setShowTranslation] = useState(false);   
  const showTranslationRef = useRef(showTranslation);  
  const [isMuteBtnDisabled, setIsMuteBtnDisabled] = useState(false);
  const [isCloseRightPanelDisabled, setIsCloseRightPanelDisabled] = useState(true);
  const [isConnectionError, setIsConnectionError] = useState(false);
  const [startingText, setStartingText] = useState('Connecting to Copilot');
  const [dotCount, setDotCount] = useState(0);
  const progressBarRef = useRef(null);  
  const playPauseBtnRef = useRef<HTMLButtonElement>(null); // Add a ref for the play/pause button
  const muteBtnRef = useRef<HTMLButtonElement>(null); // Add a ref for the play/pause button
  const audioRef = useRef<HTMLAudioElement | null>(null);  
  const videoRef = useRef<HTMLVideoElement | null>(null);  
  const conversationDivRef = useRef<HTMLDivElement | null>(null);
  const floatingButtonRef = useRef(null);
  const leftRef = useRef<HTMLDivElement | null>(null);
  const rightRef = useRef<HTMLDivElement | null>(null);

  const [numPages, setNumPages] = useState<number>();
  const containerRef = useRef(null); // Ref for the scrollable container
  const pageRefs = useRef<React.RefObject<HTMLDivElement>[]>([]); // Array of refs for each page
  const [scale, setScale] = useState(1); // Zoom level
  const [renderedPages, setRenderedPages] = useState([1]); // Track pages rendered in the DOM
  const [isTwoPageView, setIsTwoPageView] = useState(true); // Track two-page view mode

  const timeUpdateHandlerRef = useRef<((this: HTMLAudioElement, ev: Event) => any) | null>(null);
  const endedHandlerRef = useRef<((this: HTMLAudioElement, ev: Event) => any) | null>(null);
  const [isLoop, setIsLoop] = useState(false);

  // Use absolute path for PDF so production build (served from /) resolves correctly.
  const [pdfFilePath1, setpdfFilePath1] = useState(`/play/${magzines[0]}/${magzines[0]}.pdf`);
  // Debug: preflight HEAD request to surface any 404 early (removed in production when stable)
  useEffect(() => {
    if (!pdfFilePath1) return;
    (async () => {
      try {
        const r = await fetch(pdfFilePath1, { method: 'HEAD' });
        console.log('[PDF][HEAD]', pdfFilePath1, 'status=', r.status, 'ct=', r.headers.get('content-type'));
      } catch (e) {
        console.error('[PDF][HEAD] failed', pdfFilePath1, e);
      }
    })();
  }, [pdfFilePath1]);
  const [audioFilePath1, setaudioFilePath1] = useState(`./play/${magzines[0]}/${magzines[0]}.wav`);
  const [isAudioExisting, setIsAudioExisting] = useState(false);
  const [isScriptExisting, setIsScriptExisting] = useState(false);
  
  const [newAudioCaptions, setNewAudioCaptions] = useState([]);
  const audioCaptions = useRef(newAudioCaptions);

  const [newKeywords, setNewKeywords] = useState({});
  const Keywords = useRef(newKeywords);  

  const [newInstructions, setNewInstructions] = useState('');
  const instructions = useRef(newInstructions);   

  const [newMagzine, setNewMagzine] = useState(`${magzines[0].replace(/[_-]/g, " ")}`);

  const [isSelecting, setIsSelecting] = useState(false);
  const selectionStart = useRef({ x: 0, y: 0 });
  const selectionRef = useRef(null);
  const containerRefs = useRef({}); // 用于存储每个页面对的容器引用

  const [chatModel, setChatModel] = useState('gpt-realtime');  
  const chatModelRef = useRef(chatModel);  
  
  interface FlashcardItem { front: string; back: string; }
  const [flashcards, setFlashcards] = useState<FlashcardItem[]>([]);

// 修改初始状态，添加 pairIndex
  const [selectionBox, setSelectionBox] = useState({ 
    x: 0, 
    y: 0, 
    width: 0, 
    height: 0,
    pairIndex: 0  // 添加初始 pairIndex
  });


  // Screenshot Selection Area
  const SelectionOverlay = ({ box, containerRef }) => {
    if (!box || (!isSelecting && box.width === 0 && box.height === 0)) return null;
    if (!containerRef?.current) return null;

    const containerRect = containerRef.current.getBoundingClientRect();
    
    return (
      <div
        ref={selectionRef}
        style={{
          position: 'absolute', // 改回 absolute
          left: `${box.x - containerRect.left}px`, // 使用相对于容器的坐标
          top: `${box.y - containerRect.top}px`,
          width: `${box.width}px`,
          height: `${box.height}px`,
          border: '2px solid #0095ff',
          //border: isSelecting ? '2px solid #0095ff' : 'none', // 只在选择时显示边框
          backgroundColor: 'rgba(0, 149, 255, 0.1)',
          pointerEvents: 'none',
          zIndex: 9999,
        }}
      />
    );
  };

  // Ensure each page has a RefObject  
  useEffect(() => {
    if (pageRefs.current.length < renderedPages.length) {
      renderedPages.forEach((_, index) => {
        if (!pageRefs.current[index]) {
          pageRefs.current[index] = React.createRef<HTMLDivElement>();
        }
      });
    }
  }, [renderedPages])  

  // Screenshot Menu Popup after selection Mouseup
  const showScreenshotMenu = (box) => {
    const menu = document.createElement('div');
    menu.style.position = 'fixed';
    menu.style.left = `${box.x + box.width - 6}px`;  // 改为选区右边
    menu.style.top = `${box.y + box.height + 1}px`;  // 保持在选区底部  
    menu.style.backgroundColor = 'white';
    menu.style.boxShadow = '0 2px 10px rgba(0,0,0,0.1)';
    menu.style.borderRadius = '4px';
    menu.style.padding = '6px';
    menu.style.zIndex = '1001';
    menu.style.transform = 'translate(-100%, 0)'; // 向左偏移菜单自身的宽度  
    menu.style.marginLeft = '10px';  // 与选区保持一些距离
    menu.style.marginTop = '5px';    // 与选区底部保持一些距离  

    // 检查菜单是否超出视口
    setTimeout(() => {
      const menuRect = menu.getBoundingClientRect();
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;

      // 如果菜单超出右边界，向左移动
      if (menuRect.right > viewportWidth) {
        menu.style.left = `${viewportWidth - menuRect.width - 10}px`;
      }

      // 如果菜单超出底部边界，向上移动
      if (menuRect.bottom > viewportHeight) {
        menu.style.top = `${box.y - menuRect.height}px`;
      }
    }, 0);  

    // 添加加载动画函数
    let loadingInterval;
    const startLoading = () => {
      let dots = '';
      button.disabled = true; // 禁用按钮
      button.style.cursor = 'wait';
      button.style.textAlign = 'left';
      button.textContent = 'Start analyzing...'

      loadingInterval = setInterval(() => {
        dots = dots.length >= 3 ? '' : dots + '.';
        button.textContent = 'Start analyzing' + dots;
      }, 500);      
    };

    const stopLoading = () => {
  
      clearInterval(loadingInterval);
  
      // 通过 setSelectionBox 重置选区状态
      setSelectionBox({ x: 0, y: 0, width: 0, height: 0, pairIndex: 0 });
      
      // 移除菜单
      if (document.body.contains(menu)) {
        document.body.removeChild(menu);
      }
      // 移除事件监听器
      document.removeEventListener('click', closeMenu);    
    };    

    let snapShotURL = '';
    // Get Snapshot Image URL using html2canvas
    const getScreenshotURL = async () => {
      
      const container = containerRefs.current[`pair_${selectionBox.pairIndex}`].current;
      if (!container) return;

      // 获取选区元素
      const selectionElement = selectionRef.current;
      if (selectionElement) {

        // 获取容器的位置信息
        const containerRect = container.getBoundingClientRect();
        
        // 计算选区相对于容器的位置
        const relativeX = selectionBox.x - containerRect.left;
        const relativeY = selectionBox.y - containerRect.top;      

        // 使用相对坐标进行截图
        const canvas = await html2canvas(container, {
          x: relativeX + 2,
          y: relativeY + 2,
          width: selectionBox.width - 4,
          height: selectionBox.height - 4,
          backgroundColor: null,
          // 添加这些选项以提高精确度
          scale: window.devicePixelRatio, // 使用设备像素比
          useCORS: true,
          logging: true,
          windowWidth: containerRect.width,
          windowHeight: containerRect.height,
        } as any
      );     

        const imgURL = canvas.toDataURL('image/png');      
        snapShotURL = imgURL;
        return imgURL;
      }            
    };

    //getScreenshotURL();

    const imgDescribe = async () => {

      startLoading(); // 开始加载动画

      requestAnimationFrame(async () => {

          try {
            const container = containerRefs.current[`pair_${selectionBox.pairIndex}`].current;
            if (!container) return;

            // 获取选区元素
            const selectionElement = selectionRef.current;
            if (selectionElement) {

              // 获取容器的位置信息
              const containerRect = container.getBoundingClientRect();
              
              // 计算选区相对于容器的位置
              const relativeX = selectionBox.x - containerRect.left;
              const relativeY = selectionBox.y - containerRect.top;      

              // 使用相对坐标进行截图
              const canvas = await html2canvas(container, {
                x: relativeX + 2,
                y: relativeY + 2,
                width: selectionBox.width - 4,
                height: selectionBox.height - 4,
                backgroundColor: null,
                // 添加这些选项以提高精确度
                scale: window.devicePixelRatio, // 使用设备像素比
                useCORS: true,
                logging: true,
                windowWidth: containerRect.width,
                windowHeight: containerRect.height,
              } as any
            );     

              //const imgURL = canvas.toDataURL('image/png');
              const imgURL = await getScreenshotURL();
              console.log(imgURL);  
              await chatRef.current.updateScreenshot(imgURL);

              stopLoading(); // 停止加载动画    

              // Read Aloud the image description from LLM
              const client = clientRef.current;
              if(client.isConnected()){

                if(chatModelRef.current === 'gpt-realtime'){
                  client.sendUserMessageContent([
                    {
                      type: `input_image`,
                      image_url: imgURL,
                    } as any, // 'as any' used to bypass TypeScript checks
                  ]);         // This shows how to send msg type not supported by default
                }else{
                  const response = await analyzeImage(imgURL);
                  /* calling gpt-4o describe the image and then call realtime-mini to read aloud */
                  client.sendUserMessageContent([
                    {
                      type: `input_text`,
                      text: `Read Aloud: ${response}. 
                      The output should follow the format:
                      <b>Screenshot Description</b>:                      
                      - {Each sentence of the response}`,
                    },
                  ]);  
                }
                   
              }

              // 下载截图
              /*const link = document.createElement('a');
              link.download = `screenshot_page_${selectionBox.pairIndex}.png`;
              link.href = canvas.toDataURL();
              link.click();*/
            }
          } catch (error) {
            console.error('Screenshot error:', error);
          }
      });
    };

    const button = document.createElement('button');
    button.textContent = 'What can you see...';
    button.onclick = imgDescribe;
    button.style.width = '140px'; 
    button.style.padding = '4px 8px';
    button.style.cursor = 'pointer';
    
    menu.appendChild(button);
    document.body.appendChild(menu);

    // 点击其他地方关闭菜单
    const closeMenu = (e) => {
      if (!menu.contains(e.target)) {
        clearInterval(loadingInterval); // 清除动画定时器
        document.body.removeChild(menu);
        document.removeEventListener('click', closeMenu);
      }
    };
    setTimeout(() => document.addEventListener('click', closeMenu), 0);
  };    

  //Call LLM visual capbilities to analyze the image
  const analyzeImage = async (imgURL) => {
    try {    
      const response = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: "Describe the image with simple and interesting english words within 100 length" },
              {
                type: "image_url",
                image_url: {
                  "url": imgURL,
                },
              },
            ],
          },
        ],
      });

      console.log(response.choices[0].message.content);  
      return response.choices[0].message.content;        
    } catch (error) {
      console.error('Analyaze Image Error:', error.message);
    }    
  }

  // Initialize the keywords with the first magazine
  /*
  useEffect(() => {
    const bInstructions = async () => {
      const instructions = await buildInstructions();
      setNewInstructions(instructions); 
    };

    bInstructions(); // Call the async function
  }, []);     */

  const setAudioExisting = async ({magzine} = {magzine: magzines[0]}) => {

    const placeholder = 'hello';
  const response: Response = await fetch(`/api/audio/check?magzine=${encodeURIComponent(magzine)}&word=${(placeholder)}`);    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const res: any = await response.json();      
    const audioExisting = res.audioExisting;
    const basicInstructions = await buildInstructions({magzine: 'no_scripts'});
    if (audioExisting === 'true') {
      setIsAudioExisting(true);  

      if( res.scriptExisting === 'true' )
      {
        setIsScriptExisting(true);

        const instructions = await buildInstructions();
        setNewInstructions(instructions);   

        const captions = await transformAudioScripts();
        setNewAudioCaptions(captions); 

        if( res.keywordsExisting === 'true' )
        {
          setNewKeywords( await fetchKeywords({magzine: magzines[0]}) );      
        }      
        
      } else {
        setIsScriptExisting(false);
        setNewInstructions(basicInstructions);   
        if(isCaptionVisible){
          setIsCaptionVisible(false);
        }

        setNewAudioCaptions([]);
      }

      /*
      if( res.keywordsExisting === 'true' )
      {
        const keywords = await fetchKeywords();
        setNewKeywords(keywords);       
      }     */

    } else {
      setIsAudioExisting(false);
      setIsScriptExisting(false);
      setNewInstructions(basicInstructions);   

      setNewAudioCaptions([]);
    } 
    
    if(res.flashcardsExisting === 'true'){
      const flashcards = await getFlashcards({magzine: magzines[0]});
      //console.log('Flashcards Loaded:', flashcards);
      setFlashcards(flashcards);
    }else {
      setFlashcards([]);
    }     
    
  };  

  // Initialize the keywords with the first magazine
  useEffect(() => {
    setAudioExisting(); // Call the async function
  }, []);   

  // Check if there are any keywords with count > 0
  // Keywords icon display control
  const hasKeywords = React.useMemo(
    () =>
      Object.values(newKeywords).some(
        (entry) => Array.isArray(entry) && entry[2] !== 0
      ),
    [newKeywords]
  );  

  useEffect(() => {
    instructions.current = newInstructions; // Sync ref with the updated state

    if(newInstructions !== ''){
      const client = clientRef.current;
      client.updateSession({ instructions: newInstructions });
    }

  }, [newInstructions]);      

  useEffect(() => {
    Keywords.current = newKeywords; // Sync ref with the updated state
  }, [newKeywords]);    

  useEffect(() => {
    audioCaptions.current = newAudioCaptions; // Sync ref with the updated state
  }, [newAudioCaptions]);  

  useEffect(() => {
    chatModelRef.current = chatModel; // Sync ref with the updated state
  }, [chatModel]);   

  const handleModelChange = async (event: React.ChangeEvent<HTMLSelectElement>) => {
    const newModel = event.target.value;
  
    if( newModel === 'GPT-Realtime' || newModel === 'GPT-Realtime-Mini' ){

      if(newModel === 'GPT-Realtime'){
        setChatModel('gpt-realtime');
      }else{
        setChatModel('gpt-4o-mini-realtime-preview-2024-12-17');
      }      

      disConnnectRealtimeAPI();
      await new Promise(resolve => setTimeout(resolve, 500));
      connnectRealtimeAPI();      
    }

    await chatRef.current.updateChatModel(newModel);
  };

  // Update PDF file path, audio file path and audio captions when a new magzine is selected
  const handleSelectChange = async (event: React.ChangeEvent<HTMLSelectElement>) => {
    const client = clientRef.current;
    const newMagzine = event.target.value;

    setNewMagzine(`${newMagzine.replace(/[_-]/g, " ")}`);

  // Switch to absolute path to avoid relative resolution issues behind reverse proxies / nested routes
  setpdfFilePath1(`/play/${newMagzine}/${newMagzine}.pdf`);

    // check whether the audio file exists
    const placeholder = 'hello';
  const response: Response = await fetch(`/api/audio/check?magzine=${encodeURIComponent(newMagzine)}&word=${(placeholder)}`);    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const res: any = await response.json();      
    const audioExisting = res.audioExisting;
    const basicInstructions = await buildInstructions({magzine: 'no_scripts'});
    if (audioExisting === 'true') {
      setIsAudioExisting(true);  

      setaudioFilePath1(`./play/${newMagzine}/${newMagzine}.wav`);

      audioRef.current.src = `./play/${newMagzine}/${newMagzine}.wav`;
      audioRef.current.currentTime = 0;    
      setProgress(0);
      setCurrentTime(0);
      if(isPlaying){toggleAudio();}

      if( res.scriptExisting === 'true' )
      {      
        setIsScriptExisting(true);

        setNewAudioCaptions( await transformAudioScripts({magzine: newMagzine}) );
    
        const newInstructions = await buildInstructions({magzine: newMagzine});
        setNewInstructions( newInstructions );

        client.updateSession({ instructions: newInstructions });      
      }else{
        setIsScriptExisting(false);        
        setNewInstructions( basicInstructions );
        if(isCaptionVisible){
          setIsCaptionVisible(false);
        }
        //client.updateSession({ instructions: 'You are a helpful assistant and ready to answer any question' }); 
        client.updateSession({ instructions: basicInstructions });      

        setNewAudioCaptions( [] );
      }    

      if( res.keywordsExisting === 'true' )
      {
        setNewKeywords( await fetchKeywords({magzine: newMagzine}) );      
      }else{
        const keywords = await genKeywords({magzine: newMagzine});
        setNewKeywords(keywords);        
        //setNewKeywords( {} );
      }

    } else {  
      setIsAudioExisting(false);  
      audioRef.current.src = '';
      audioRef.current.currentTime = 0;    
      setProgress(0);
      setCurrentTime(0);            

      //client.updateSession({ instructions: 'You are a helpful assistant and ready to answer any question' });         
      setIsScriptExisting(false);
      setNewInstructions( basicInstructions );
      client.updateSession({ instructions: basicInstructions });      

      setNewKeywords( {} );   
    }    

    if( res.flashcardsExisting === 'true'){
      const flashcards = await getFlashcards({magzine: newMagzine});
      //console.log('Flashcards Loaded:', flashcards);
      setFlashcards(flashcards);
    } else {
      setFlashcards([]);
    }
  };  

  // Some times isConnected could not reflect the actual connection status due to the delay of the state update
  // To solve this issue, we use a ref to store the actual connection status
  const isConnectedRef = useRef(isConnected);
  // Update the ref whenever `isConnected` changes
  useEffect(() => {
    isConnectedRef.current = isConnected;

    //const client = clientRef.current;
    //if(!client.isConnected()){
    if(!isConnected){
      connnectRealtimeAPI();
    }

  }, [isConnected]);

  useEffect(() => {
    const startCountDown = document.getElementById('countDownStartBtn');
    const resetCountDown = document.getElementById('countDownResetBtn');

    if(startCountDown && isConnectedRef.current){
      startCountDown.click();
    }

    if(resetCountDown && !isConnectedRef.current){
      resetCountDown.click();
    }
  }, [isConnected]);  

  interface FormatTimeProps {
    time: number;
  }  

  interface PageRefs {
    current: Array<React.RefObject<HTMLDivElement>>;
  }

  interface GoToPageProps {
    pageNumber: number;
  }

  const goToPage = ({ pageNumber }: GoToPageProps): void => {
    if (pageRefs.current[pageNumber]){
      // Scroll the specific page into view
      pageRefs.current[pageNumber].current?.scrollIntoView({
        behavior: 'auto', // Instantly jumps to the page
        block: 'start', // Align the top of the page with the container
      });
    } else {
      alert(`Page ${pageNumber} is out of range!`);
    }
  };

  function onDocumentLoadSuccess({ numPages }: { numPages: number }): void {
    setNumPages(numPages);

    pageRefs.current = Array(numPages)
      .fill(null)
      .map((_, i) => pageRefs.current[i] || React.createRef());    
  }

  interface OnPageLoadSuccessProps {
    pageNumber: number;
  }

  const onPageLoadSuccess = ({ pageNumber }: OnPageLoadSuccessProps): void => {
    console.log(`Page ${pageNumber} loaded successfully.`);

    // Add the next page to the DOM
    /* Previous Logic
    setRenderedPages((prev) => {
      const nextPage = Math.min(pageNumber + 1, numPages || 0);
      return prev.includes(nextPage) ? prev : [...prev, nextPage];
    });    */

    // 在双页视图模式下，一次加载两页
    setRenderedPages((prev) => {
      const nextPages = [...prev];
      
      if (isTwoPageView) {
        // 如果是第一页，加载第2页和第3页
        if (pageNumber === 1) {
          if (!prev.includes(2)) nextPages.push(2);
          if (!prev.includes(3)) nextPages.push(3);
        } else {
          // 其他情况，加载后续两页
          const nextPage1 = Math.min(pageNumber + 2, numPages || 0);
          const nextPage2 = Math.min(pageNumber + 3, numPages || 0);
          
          if (!prev.includes(nextPage1)) nextPages.push(nextPage1);
          if (!prev.includes(nextPage2)) nextPages.push(nextPage2);
        }
      } else {
        // 单页视图模式
        const nextPage = Math.min(pageNumber + 1, numPages || 0);
        if (!prev.includes(nextPage)) nextPages.push(nextPage);
      }
      
      return nextPages;
    });  
  };

  // 将页面分组为双页显示
  const getPagePairs = (pages: number[]) => {
    if (!isTwoPageView) {
      return pages.map(page => [page]);
    }

    const pairs: number[][] = [];
    // 第一页单独显示
    if (pages.includes(1)) {
      pairs.push([1]);
      pages = pages.filter(p => p !== 1);
    }
    
    // 其余页面两两分组
    for (let i = 0; i < pages.length; i += 2) {
      pairs.push([
        pages[i],
        i + 1 < pages.length ? pages[i + 1] : null
      ].filter(Boolean) as number[]);
    }
    return pairs;
  };  

  // Handle zooming of the PDF when the user clicks the '+' button  
  const togglePageView = () => {
    setIsTwoPageView(!isTwoPageView);
  };  

  const openKeywords = () => {
    /*
    closeRightPanel();

    const rightArrow = document.getElementById('openRightArrow');
    if(rightArrow){
      rightArrow.style.display = 'flex';
    }  */
  }

  const closeRightArrowNew = () => {
    closeRightPanel();

    const rightArrow = document.getElementById('openRightArrow');
    if(rightArrow){
      rightArrow.style.display = 'flex';
    }

    const closeRightArrow = document.getElementById('closeRightArrow');
    if(closeRightArrow){
      closeRightArrow.style.display = 'none';
    }    

    /*
    const captionDisplay = document.getElementById('captionDisplay');
    if(isCaptionVisible && captionDisplay){
      captionDisplay.style.width = `100%`;
    }   */ 

    const captionDisplay = document.getElementById('captionDisplay');
    const captionWidth = window.innerWidth - 51;
    if(isCaptionVisible && captionDisplay){
      captionDisplay.style.width = `${captionWidth}px`;
    }    

    /*
    const openKeywords = document.getElementById('openKeywords');    
    if(openKeywords){
      openKeywords.click();
    }*/

  }  

  const closeRightPanel = () => {

    /*
    const muteButton = document.getElementById('muteButton');
    if(muteButton){
      muteButton.style.display = 'flex';
    } */   

    setIsCloseRightPanelDisabled(true);
    const splitter = document.getElementById('splitter');
    const chatBot = document.getElementById('chatContainer');
    const rightPanel = rightRef.current;
    if(rightPanel)
    {
      splitter.style.display = 'none';
      (rightPanel as HTMLDivElement).style.display = 'none';
      chatBot.style.display = 'none';
      //conversationDivRef.current.style.display = 'flex'; 

      /* isMuted = true when UI button IS NOT Muted
      if(!isMuted){
        toggleMuteRecording();
      }     */ 
    }
  }

  //Show Conversion list
  const showConversation = () => {
    setIsCloseRightPanelDisabled(false);
    const splitter = document.getElementById('splitter');
    const chatBot = document.getElementById('chatContainer');

    if((splitter as HTMLDivElement).style.display === 'flex'){
      //(splitter as HTMLDivElement).style.display = 'none';
      //rightRef.current.style.display = 'none';  
      
      chatBot.style.display = 'none';
      /*
      if(conversationDivRef.current.style.display === 'none') {
        chatBot.style.display = 'none';
        conversationDivRef.current.style.display = 'flex';        
      }*/
    }
    else{
      (splitter as HTMLDivElement).style.display = 'flex';
      rightRef.current.style.display = 'flex';
      chatBot.style.display = 'none';
      //conversationDivRef.current.style.display = 'flex';
    }    
    openRightPanel();  
  };    

  // Handle zooming of the PDF when the user clicks the '-' button
  const zoomIn = () => {
    setScale((prevScale) => Math.min(prevScale + 0.05, 3.0)); // Increase scale, max 3.0

    const container = containerRef.current as HTMLDivElement | null;
    if(container){
      
      const scrollTop = container.scrollTop;
      const scrollLeft = container.scrollLeft;

      // Calculate new scroll position based on the scale change
      const newScrollTop = scrollTop * scale;
      const newScrollLeft = scrollLeft * scale;      

      container.scrollLeft = newScrollLeft;
      container.scrollTop  = newScrollTop;
    }
  };

  // Handle zooming of the PDF when the user clicks the '+' button  
  const zoomOut = () => {
    setScale((prevScale) => Math.max(prevScale - 0.05, 0.5)); // Decrease scale, min 0.5

    const container = containerRef.current as HTMLDivElement | null;
    if(container){
      
      const scrollTop = container.scrollTop;
      const scrollLeft = container.scrollLeft;

      // Calculate new scroll position based on the scale change
      const newScrollTop = scrollTop * scale;
      const newScrollLeft = scrollLeft * scale;      

      container.scrollLeft = newScrollLeft;
      container.scrollTop  = newScrollTop;
    }    

  };   

  const selectionTalkAbout = async (input: string) => {
    const client = clientRef.current;
    if(client.isConnected()){
        client.sendUserMessageContent([
        {
          type: `input_text`,
          text: `Hello, I want to talk about '${input}'`,
        },
      ]);  

      if(!isMuteBtnDisabled && isMuted){
        muteBtnRef.current.click();

        hideContextMenu();
        //openChatbot();
        const openRightArrow = document.getElementById('openRightArrow');
        if(openRightArrow){
          openRightArrow.click();
        }        
      }
    }
  }

  // Handle text are selected, show the popup to read aloud
  let readAloudBuffer = null; // Global buffer to store the read aloud audio
  const selectionTTS = async (input: string) => { 

    if(readAloudBuffer) {
      wavStreamPlayerRef.current.add16BitPCM(readAloudBuffer);
    }else{
      const pcm = await openai.audio.speech.create({
        model: "tts-1",
        voice: tts_voice,
        response_format: "pcm",
        speed: 1.0,
        input: input,
      });
      const pcmArrayBuffer = await pcm.arrayBuffer(); // Convert the response to an ArrayBuffer
      const readAloudPcm = new Int16Array(pcmArrayBuffer);
      wavStreamPlayerRef.current.add16BitPCM(readAloudPcm);

      // Insert the selection into the chat as user message
      chatRef.current.updateSelection(input);

      // If selection is an English word or a phrase
      // provide a definition and example sentences
      if(input.length < 100) {
        chatRef.current.explainSelection(`如果所选择的${input}是单个英文或者是一个词组，那么给出它的中文解释，并且提供两个英文例句，同时给出例句的翻译。如果是一个句子，那么直接给出它的翻译`);
      }      

      const wavFile = await WavRecorder.decode(
        readAloudPcm,
        24000,
        24000
      );    
      // Insert the TTS audio into the chat as assistant message （show on the left side of the conversation panel）
      chatRef.current.updateReadAloud(wavFile.url);

      readAloudBuffer = readAloudPcm;

      hideContextMenu();
      openChatbot();
    }
  }

  //--- Test new connection to zhipu Realtime API  ---  
  const getJWT = async () => {
  const tokenResponse = await fetch("/api/zhipu/jwt");
    //const data = await tokenResponse.json();
    const jwt = await tokenResponse.text();
    //const jwt = data.client_secret.value;
    console.log(jwt);
    return jwt;    
  }  
  
  // Try to prevent zoom in/out event for the whole page
  // Status: logic not work yet
  const handleWheelZoom = (event: WheelEvent): void => {
    
    const buttonRow: HTMLDivElement | null = document.getElementById('button-row') as HTMLDivElement | null;
    if (buttonRow) {
      if(event.target === buttonRow) {return;}
    }

    if (event.ctrlKey) {
      // Prevent default zoom behavior
      if (event.target !== containerRef.current) {return;}
      event.preventDefault();
      event.stopPropagation();

      //const zoomSpeed = 0.05; // Adjust sensitivity
      // Adjust zoom level
      const newScale = scale + (event.deltaY < 0 ? 0.1 : -0.1);
      setScale(Math.max(newScale, 0.5)); // Minimum zoom level of 0.5

      if (buttonRow) {
        buttonRow.style.transform = `scale(${1 / newScale})`;
      }
    }
  };

  // Add the zoom handler with `capture` mode
  useEffect(() => {
    const container = containerRef.current as HTMLDivElement | null;

    if (container !== null) {
      if (container) {
        container.addEventListener('wheel', handleWheelZoom, { capture: true });
      }
    }

      // Prevent wheel events from affecting the window when inside the container
      const preventWindowZoom = (event: WheelEvent) => {
        if (event.ctrlKey && event.target === container) {
          event.preventDefault();
        }
      };
      window.addEventListener('wheel', preventWindowZoom, { passive: false });    

    // Cleanup the event listener on unmount
    return () => {
      if (container) {
        container.removeEventListener('wheel', handleWheelZoom, { capture: true });
        window.removeEventListener('wheel', preventWindowZoom);
      }
    };
  }, [scale]);  

  //Dynamic effect of 'Copilot is turning on......' 
  useEffect(() => {
    let intervalId: NodeJS.Timeout;
  
    if (isMuteBtnDisabled) {
      intervalId = setInterval(() => {
        setDotCount((prevCount) => (prevCount + 1) % 4); // Cycle through 0, 1, 2, 3
      }, 500);
    } else {
      //setStartingText(''); // Clear the text when not starting
      setStartingText(`Connect${'.'.repeat(dotCount)}` + '\u00A0\u00A0\u00A0'); // Clear the text when not starting
    }
  
    return () => clearInterval(intervalId); // Cleanup interval on component unmount or when isMuteBtnDisabled changes
  }, [isMuteBtnDisabled]);  

  useEffect(() => {
    if (isMuteBtnDisabled) {
      if (dotCount === 0) {
        setStartingText(`Connect${'.'.repeat(dotCount)}` + '\u00A0\u00A0\u00A0');
      }
      if (dotCount === 1) {
        setStartingText(`Connect${'.'.repeat(dotCount)}` + '\u00A0\u00A0');
      }
      if (dotCount === 2) {
        setStartingText(`Connect${'.'.repeat(dotCount)}` + '\u00A0');
      } 
      if (dotCount === 3) {
        setStartingText(`Connect${'.'.repeat(dotCount)}`);
      }            
    }
  }, [dotCount, isMuteBtnDisabled]);  

  // Load the audio file when the component mounts
  useEffect(() => {
    audioRef.current = new Audio(audioFilePath1);

    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.src = '';
      }
    };    
  }, []);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.playbackRate = playbackRate; // Set the playback speed
    }
  }, [playbackRate]); 

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = playbackVolume; // Set the playback speed
    }
  }, [playbackVolume]);   

  const toggleCaptionVisibility = () => {
    setIsCaptionVisible(!isCaptionVisible);

    // Adjust the caption display width based on the right panel width
    const rightPanel = rightRef.current;
    if(rightPanel){
      const computedStyle = getComputedStyle(rightPanel);
      const rightPanelWidth = computedStyle.width;      

      const newCloseRightArrowRight = parseInt(rightPanelWidth, 10) + 15;
      //const captionWidth = window.innerWidth - newCloseRightArrowRight - 15;
      const captionWidth = window.innerWidth - newCloseRightArrowRight - 38;

      if( rightRef.current.style.display === 'none'){
        //setCaptionWidth(100);
        setCaptionWidth(96);      
      }else{
        setCaptionWidth((captionWidth / window.innerWidth) * 100);
      }
    } 
  };     

  const adjustCaptionFontSize = (adjustment: number) => { 
    const captionDisplay = document.getElementById('captionDisplay');
    if (captionDisplay && captionDisplay.parentElement) {

      const currentFontSize = window.getComputedStyle(captionDisplay).fontSize;
      const parentFontSize = window.getComputedStyle(captionDisplay.parentElement).fontSize;
      const baseFontSize = parseFloat(parentFontSize); // Get the base font size of the parent element
      const currentFontSizeInEm = parseFloat(currentFontSize) / baseFontSize; // Convert px to em based on parent font size
      const newFontSizeInEm = (currentFontSizeInEm + adjustment) > 3 ? 3 : ((currentFontSizeInEm + adjustment) < 1 ? 1 : (currentFontSizeInEm + adjustment)) ; // Adjust the font size
      captionDisplay.style.fontSize = `${newFontSizeInEm}em`;                  
    }      
  }

  const formatDuration = ({ time }: FormatTimeProps): string => {
    const hours = Math.floor(time / 3600);
    const minutes = Math.floor((time % 3600) / 60);
    const seconds = Math.floor(time % 60);
    return hours > 0
      ? `${hours}:${minutes < 10 ? '0' : ''}${minutes}:${seconds < 10 ? '0' : ''}${seconds}`
      : `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
  };

  interface SpeedControlClickEvent extends React.MouseEvent<HTMLDivElement> {
    stopPropagation: () => void;
  }

  const handleSpeedControlClick = (event: SpeedControlClickEvent, speed: number): void => {
    event.stopPropagation(); // Prevent the event from bubbling up to the progress bar

    setPlaybackRate(speed);
    console.log(`Speed set to ${speed}`);
  };  

  const handleClearKeyword = (event: SpeedControlClickEvent): void => {
    event.stopPropagation(); // Prevent the event from bubbling up to the progress bar

    setKeyword('');
    // Remove any existing event listeners to prevent multiple registrations
    if (timeUpdateHandlerRef.current) {
      audioRef.current.removeEventListener('timeupdate', timeUpdateHandlerRef.current);
    }
    if (endedHandlerRef.current) {
      audioRef.current.removeEventListener('ended', endedHandlerRef.current);
    }

    const closeKeywords = document.getElementById('closeKeywords');
    if(closeKeywords){
      closeKeywords.click();
    }   

  };     

  const handleVolumeControlClick = (event: SpeedControlClickEvent, volume: number): void => {
    event.stopPropagation(); // Prevent the event from bubbling up to the progress bar

    setPlaybackVolume(volume);
    console.log(`Speed set to ${volume}`);
  };    
  
  const handleLoopClick = (event: SpeedControlClickEvent): void => {
    event.stopPropagation(); // Prevent the event from bubbling up to the progress bar

    setIsLoop(!isLoop);
  };    

  const createHandleTimeUpdate = (audioElement: HTMLAudioElement, currentTime: number, endTime: number) => {
    return () => {

     /* if(!isLoop) {
        if (timeUpdateHandlerRef.current) {
          audioElement.removeEventListener('timeupdate', timeUpdateHandlerRef.current);
        }          
      }  */    
      
      if (audioElement.currentTime >= endTime) {
        audioElement.currentTime = currentTime; // Reset to start time
        audioElement.play();
      }
    };
  };
  
  const createHandleEnded = (audioElement: HTMLAudioElement, currentTime: number, endTime: number) => {
    return () => {

      /*if(!isLoop) {
        if (endedHandlerRef.current) {
          audioElement.removeEventListener('ended', endedHandlerRef.current);
        }          
      }    */  

      if (audioElement.currentTime < endTime) {
        audioElement.currentTime = currentTime;
        audioElement.play();

      }
    };
  };  

  const loopKeywordPlay = (event: React.MouseEvent, key: string, currentTime: number, endTime: number, page: number) => {

    const splitter = document.getElementById('splitter');
    const closeKeywords = document.getElementById('closeKeywords');
    if ( splitter.style.display === 'flex' ){
      closeKeywords.click();
    }

    //setKeyword(key);

    if(key === keyword){
      setKeyword('');
      // Remove any existing event listeners to prevent multiple registrations
      if (timeUpdateHandlerRef.current) {
        audioRef.current.removeEventListener('timeupdate', timeUpdateHandlerRef.current);
      }
      if (endedHandlerRef.current) {
        audioRef.current.removeEventListener('ended', endedHandlerRef.current);
      }
      return;
    }else{
      setKeyword(key);
    }

    if (audioRef.current) {

      // Remove any existing event listeners to prevent multiple registrations
      if (timeUpdateHandlerRef.current) {
        audioRef.current.removeEventListener('timeupdate', timeUpdateHandlerRef.current);
      }
      if (endedHandlerRef.current) {
        audioRef.current.removeEventListener('ended', endedHandlerRef.current);
      }      

      goToPage({ pageNumber: page });
      const pdfViewer = document.getElementById("pdfFile");
      if (pdfViewer) {
        //(pdfViewer as HTMLObjectElement).data = pdfFilePath + `?t=` + (new Date()).getTime() + `#page=` + page;//&t=${new Date().getTime()}
        (pdfViewer as HTMLObjectElement).data = pdfFilePath1 + `?t=` + (new Date()).getTime() + `#page=` + page;//&t=${new Date().getTime()}
        console.log((pdfViewer as HTMLObjectElement).data);
      }          

      audioRef.current.currentTime = currentTime;

      if(!isPlaying){
        if (playPauseBtnRef.current) {
          playPauseBtnRef.current.click(); // Trigger the button click event
        }
      }

      //audioRef.current.play(); 
/*
      const handleTimeUpdate = () => {
        if (audioRef.current && audioRef.current.currentTime >= endTime) {
          audioRef.current.currentTime = currentTime; // Reset to start time
          audioRef.current.play();
        }
      };
  
      const handleEnded = () => {
        if (audioRef.current && audioRef.current.currentTime < endTime) {
          audioRef.current.currentTime = currentTime;
          audioRef.current.play();
        }
      }; 

      audioRef.current.removeEventListener('timeupdate', handleTimeUpdate);
      audioRef.current.removeEventListener('ended', handleEnded);           
      
      audioRef.current.addEventListener('timeupdate', handleTimeUpdate);
      audioRef.current.addEventListener('ended', handleEnded);      
  
      // Clean up event listeners when the audio is paused or stopped
      audioRef.current.onpause = () => {
        if (audioRef.current) {
          audioRef.current.removeEventListener('timeupdate', handleTimeUpdate);
          audioRef.current.removeEventListener('ended', handleEnded);      
        }
      };*/
      //if(isLoop) {
        const handleTimeUpdate = createHandleTimeUpdate(audioRef.current, currentTime, endTime);
        const handleEnded = createHandleEnded(audioRef.current, currentTime, endTime);

        // Store event handlers in refs
        timeUpdateHandlerRef.current = handleTimeUpdate;
        endedHandlerRef.current = handleEnded;      

        // Remove any existing event listeners to prevent multiple registrations
        audioRef.current.removeEventListener('timeupdate', handleTimeUpdate);
        audioRef.current.removeEventListener('ended', handleEnded);
    
        audioRef.current.addEventListener('timeupdate', handleTimeUpdate);
        console.log('timeupdate event listener registered');
    
        audioRef.current.addEventListener('ended', handleEnded);
        console.log('ended event listener registered');
    
        // Clean up event listeners when the audio is paused or stopped
        audioRef.current.onpause = () => {
          if (audioRef.current) {
            //audioRef.current.removeEventListener('timeupdate', handleTimeUpdate);
            //audioRef.current.removeEventListener('ended', handleEnded);
            console.log('event listeners removed');
          }
        };
      //}            
    }    

  }
  
  const handleKeywordClick = (event: SpeedControlClickEvent, keyword: string, currentTime: number, endTime: number, page: number): void => {
    event.stopPropagation(); // Prevent the event from bubbling up to the progress bar

    setKeyword(keyword);
    if (audioRef.current) {
      audioRef.current.currentTime = currentTime;

      goToPage({ pageNumber: page });
      const pdfViewer = document.getElementById("pdfFile");
      if (pdfViewer) {
        //(pdfViewer as HTMLObjectElement).data = pdfFilePath + `?t=` + (new Date()).getTime() + `#page=` + page;//&t=${new Date().getTime()}
        (pdfViewer as HTMLObjectElement).data = pdfFilePath1 + `?t=` + (new Date()).getTime() + `#page=` + page;//&t=${new Date().getTime()}
        console.log((pdfViewer as HTMLObjectElement).data);
      }
    }
  };    

  const repeatPrevious = () => {

    const currentCaptionIndex = audioCaptions.current.findIndex((caption, index) => {
      const nextCaption = audioCaptions.current[index + 1];
      return currentTime >= caption.time && (!nextCaption || currentTime < nextCaption.time);
    });      

    if(currentCaptionIndex > 0 && currentCaptionIndex - 2 >= 0){
      const previousCaption = audioCaptions.current[currentCaptionIndex - 2];
      audioRef.current.currentTime = previousCaption.time;      
    }   
  }  

  const repeatForward = () => {

    const currentCaptionIndex = audioCaptions.current.findIndex((caption, index) => {
      const nextCaption = audioCaptions.current[index + 1];
      return currentTime >= caption.time && (!nextCaption || currentTime < nextCaption.time);
    });      

    if(currentCaptionIndex > 0){
      const nextCaption = audioCaptions.current[currentCaptionIndex + 1];
      if(nextCaption){
        audioRef.current.currentTime = nextCaption.time;      
      }
    }  
  }

  const repeatCurrent = () => {

    const currentCaptionIndex = audioCaptions.current.findIndex((caption, index) => {
      const nextCaption = audioCaptions.current[index + 1];
      return currentTime >= caption.time && (!nextCaption || currentTime < nextCaption.time);
    });      

    const currentCaption = audioCaptions.current[currentCaptionIndex];
    audioRef.current.currentTime = currentCaption.time;      

    if (!isPlaying && playPauseBtnRef.current) {
      playPauseBtnRef.current.click(); // Trigger the button click event
    }    

  }  

  const translateSentence = (sentence: string) => { 
    const client = clientRef.current;
    if(client.isConnected()){
        client.sendUserMessageContent([
        {
          type: `input_text`,
          text: `Translate: the '${sentence}' into Chinese. only output the chinese translation with one(at least) to five(most) keywords according to your understanding(e.g. words with long length or difficult prouncation should be chosen as keywords). 
          follow bellow format strictly:
          "{Chinese Translation}" \n -<b>"{keyword1 in English}"</b>是"{Chinese of keyword1}"的意思 \n -<b>{keyword2 in English}</b>是{Chinese of keyword2}的意思 \n -<b>{keyword3 in English}</b>是{Chinese of keyword3}的意思 \n -<b>{keyword4 in English}</b>是{Chinese of keyword4}的意思 \n -<b>{keyword5 in English}</b>是{Chinese of keyword5}的意思
          \n Example:
          "The cat is on the mat" -> "猫在垫子上. \n -"cat"是"猫"的意思\n -"mat"是"垫子"的意思"`,
        },
      ]);  

    }    
  }

  const translateCurrentCaption = () => {
    if(currentCaption){
      if (isPlaying && playPauseBtnRef.current) {
        playPauseBtnRef.current.click(); // Stop the audio if it's playing
      }
      translateSentence(currentCaption);
    }
  }  


  useEffect(() => {
    showTranslationRef.current = showTranslation; // Sync ref with the updated state
  }, [showTranslation]);     

  const showTranslateCurrentCaption = () => {
    setShowTranslation(!showTranslation);
  }  

  //Update the progress bar and current time when the audio is playing
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const updateProgress = () => {
      if (audio.duration) {
        setProgress((audio.currentTime / audio.duration) * 100);
        setCurrentTime(audio.currentTime);     
      }
    };

    interface Caption {
      text: string;
      time: number;
    }

    interface WordTiming {
      word: string;
      startTime: number;
      endTime: number;
    }

    const splitCaptionIntoWords = (caption: Caption, nextCaptionTime?: number): WordTiming[] => {
      const words = caption.text.split(' ');
      //const words = caption.text.split(/(?<!\w\.\w.)(?<![A-Z][a-z]\.)(?<=\w)\s/); // Preserve phrases

      // Calculate duration based on the next caption or assume a default duration
      const duration = nextCaptionTime ? nextCaptionTime - caption.time : 2; // Assume 2 seconds for the last caption
      const wordDuration = duration / words.length; // Evenly distribute word timing

      return words.map((word, index) => ({
                        word,
                        startTime: caption.time + index * wordDuration,
                        endTime: caption.time + (index + 1) * wordDuration,
                      }));
    };    

    const updateCaption = () => {
      const currentTime = audio.currentTime;

      // Find the current caption
      const currentCaptionIndex = audioCaptions.current.findIndex((caption, index) => {
        const nextCaption = audioCaptions.current[index + 1];
        return currentTime >= caption.time && (!nextCaption || currentTime < nextCaption.time);
      });
    
      if (currentCaptionIndex !== -1) {
        const currentCaption = audioCaptions.current[currentCaptionIndex];
        const nextCaption = audioCaptions.current[currentCaptionIndex + 1];
        const translationCaption = audioCaptions.current[currentCaptionIndex - 1];
        const wordsWithTiming = splitCaptionIntoWords(currentCaption, nextCaption?.time);
    
        // Find the active word
        const currentWord = wordsWithTiming.find(
          (word, index) =>
            currentTime >= word.startTime && currentTime < word.endTime ||
            (index === 0 && currentTime < word.endTime) // Special case for the first word
        );
    
        if (currentWord) {
          // Highlight the active word
          const highlightedCaption = wordsWithTiming
            .map((word) =>
              word === currentWord
                ? ` <span style="border-radius: 4px; color: #00FFFF; display: inline-block; margin: 0 1px;">${word.word}</span> `
                : ` <span style="display: inline; margin: 0 1px;">${word.word}</span> `
            )
            .join(' ');           

          if(showTranslationRef.current){
            setCurrentCaption(highlightedCaption + '<br />' + translationCaption.text); // Update the UI with translation            
          } else {
            setCurrentCaption(highlightedCaption); // Update the UI without translation
          }
        }
      }
    };   

    const handleLoadedMetadata = () => {
      setTotalDuration(audio.duration);
    };

    audio.addEventListener('timeupdate', updateProgress);
    audio.addEventListener('timeupdate', updateCaption);
    audio.addEventListener('loadedmetadata', handleLoadedMetadata);

    return () => {
      audio.removeEventListener('timeupdate', updateProgress);
      audio.removeEventListener('timeupdate', updateCaption);
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
    };
  }, []);  

  const handleSplitterMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {    
    setIsDragging(true);
    setIsSplitterDragging(true);
    resizePanel(e.nativeEvent);      
    document.body.style.userSelect = 'none'; // Prevent text selection
    //document.body.classList.add('no-select'); // Add no-select class to prevent text selection

    const splitter = document.getElementById('splitter');
    splitter.style.backgroundColor = '#696969';
  };  

  const resizePanel = (e: MouseEvent | React.MouseEvent<HTMLDivElement>) => {
    const rightPanel = rightRef.current;
    const tempWidth = window.innerWidth - e.clientX - 12;
    const newrightWidth = tempWidth > 700 ? 700 : tempWidth < 400 ? 400 : tempWidth;    
    if(rightPanel)
    {
      (rightPanel as HTMLDivElement).style.width = `${newrightWidth}px`;
    }

    const closeRightArrow = document.getElementById('closeRightArrow');
    if(closeRightArrow){
      const newCloseRightArrowRight = newrightWidth + 15;
      closeRightArrow.style.right = `${newCloseRightArrowRight}px`;
    }      

    const captionDisplay = document.getElementById('captionDisplay');
    //const captionWidth = window.innerWidth - newrightWidth - 30;
    const captionWidth = window.innerWidth - newrightWidth - 53;
    if(isCaptionVisible && captionDisplay){
      captionDisplay.style.width = `${captionWidth}px`;
    }

  };  

  /*
  const handleMouseClick = (event: MouseEvent) => {

    const menu = document.getElementById("contextMenu");
    if (!menu.contains(event.target as Node)) {
      hideContextMenu();
    }   
  };  

  useEffect(() => {
    document.addEventListener('click', handleMouseClick);
    return () => {
      document.removeEventListener('click', handleMouseClick);
    };
  }, []);    */

  useEffect(() => {
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging]);    

  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
      setIsDragging(true);
      setIsProgressDragging(true);
      updateProgress(e.nativeEvent);

      if (audioRef.current) {
        if (timeUpdateHandlerRef.current) {
          audioRef.current.removeEventListener('timeupdate', timeUpdateHandlerRef.current);
        }
        if (endedHandlerRef.current) {
          audioRef.current.removeEventListener('ended', endedHandlerRef.current);
        }     
      }      

    };

  const handleMouseMove = (e: MouseEvent) => {

    const buttonRowTop = document.getElementById('.button-row-top');
    if ( buttonRowTop && e.clientY < 50) { // Adjust the value as needed
      buttonRowTop.style.display = 'flex';
    }    

    if (isDragging) {
      if (isProgressDragging) {
        updateProgress(e);
      }
      if (isSplitterDragging) {
        resizePanel(e);
      }
    }   
    
  };

  const askDeepSeekByPrompt = async (prompt) => {

    try{
      const query = prompt;
  const response: Response = await fetch(`/api/deepseek/chat?q=${encodeURIComponent(query)}`);
      if (!response.ok) {
        return null;
      }        
  
      const resp: any = await response.json();    
      console.log(resp);

      return resp;
    }
    catch(error){
      console.log("there is error during chat in Function Call: Ask DeepSeek");
    }    
  }    

  const createImageByPrompt = async (prompt) => {

    //Generate image by recraft.ai for the given word at the first time
  const response: Response = await fetch(`/api/recraft/image_prompt?magzine=${encodeURIComponent(newMagzine)}&word=${(prompt)}`);    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    console.log('after image request');
    const image: any = await response.json();      
    const imgURL = image.imgURL;
    const propt = image.prompt;    
    console.log(imgURL);

    await chatRef.current.updateGenImage(`![Image Could not be loaded](${imgURL} "${propt}")`); 
    
  }  

  //const imagesContext = (require as any).context('../wordCard', false, /\.png$/);
  // Explain the selected word and generate an image by recraft.ai
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const explainAndShowImage = async (word) => {
    //openChatbot();
    const openRightArrow = document.getElementById('openRightArrow');
    if(openRightArrow){
      openRightArrow.click();
    }
    /* Previous Instruction
    clientRef.current.updateSession({instructions: `
      Provide Chinese meaning, part of speech and English phonetic transcription in one line with splitter slash and a new line with two usage examples in English with also their chinese translation for the given word. The two English usage examples should prefer to use the simple words in the sentence. Only output the content and skip the words, e.g. 'Chinese meaning:', 'Part of speech:' or 'English phonetic transcription:'.
      The output should follow the format:
      {word}: {chinese meaning1};{chinese meaning1} / {part of speech} / {english phonetic transcription}<br />
      Usage Examples:
       - {usage example1 in English} ({chinese translation1})
       - {usage example2 in English} ({chinese translation1})
      `});     */

      
    const client = clientRef.current;
    if(client.isConnected()){
        client.sendUserMessageContent([
        {
          type: `input_text`,
          text: `wordcard: Show word card about ${word} in a way that is easy and fun for a young child to understand with tone Lighthearted, playful, and encouraging.       
                  Provide Chinese meaning, part of speech and English phonetic transcription in one line with splitter slash and a new line with two usage examples in English with also their chinese translation for the given word. The two English usage examples should prefer to use the simple words in the sentence. Only output the content and skip the words, e.g. 'Chinese meaning:', 'Part of speech:' or 'English phonetic transcription:'.
                  The output should follow the format:
                  <b>${word}</b>: {chinese meaning1};{chinese meaning2} / {part of speech} / {International Phonetic Alphabet}<br />
                  Usage Examples:
                  - {usage example1 in English} ({chinese translation1})
                  - {usage example2 in English} ({chinese translation1})
          `,
        },
      ]);  
    }  

      /*
    clientRef.current.updateSession({instructions: `
      # Personality and Tone
      ## Identity
      You are a friendly and playful teacher who loves explaining words to young children (ages 5-7). You make learning fun by using simple words, short sentences, and lots of relatable examples. You enjoy telling mini-stories, using silly comparisons, and making kids smile while they learn.  

      ## Demeanor
      Cheerful, warm, and engaging—like a fun teacher or a friendly cartoon character who is always excited to help.  

      ## Tone
      Lighthearted, playful, and encouraging. Every response should feel friendly and full of curiosity.  

      ## Level of Enthusiasm
      High! You should sound excited about teaching and make learning feel like an adventure.  

      ## Level of Formality  
      Casual and child-friendly, like a fun conversation rather than a lesson.  

      ## Level of Emotion  
      Very expressive! Use excitement, surprise, and warmth in your responses.  

      ## Filler Words  
      Occasionally use playful expressions like “Ooooh!” “Wow!” “Hmm, let’s think!” to make it sound natural.  

      ## Pacing  
      Moderate, with pauses where needed to make sure the child has time to think and respond.        

      ## Task
      Your job is to show word card in a way that is easy and fun for a young child to understand.       
      Provide Chinese meaning, part of speech and English phonetic transcription in one line with splitter slash and a new line with two usage examples in English with also their chinese translation for the given word. The two English usage examples should prefer to use the simple words in the sentence. Only output the content and skip the words, e.g. 'Chinese meaning:', 'Part of speech:' or 'English phonetic transcription:'.
      The output should follow the format:
      {word}: {chinese meaning1};{chinese meaning1} / {part of speech} / {english phonetic transcription}<br />
      Usage Examples:
       - {usage example1 in English} ({chinese translation1})
       - {usage example2 in English} ({chinese translation1})
      `});                    
    chatRef.current.chatFromExternal(`'${word}'`);
    await sleep(1500);    
    //restore the original instructions
    clientRef.current.updateSession({ instructions: instructions.current }); 
*/

    //Generate image by recraft.ai for the given word at the first time
  const response: Response = await fetch(`/api/recraft/image?magzine=${encodeURIComponent(newMagzine)}&word=${(word)}`);    
    /*
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }*/

    if(response.ok){
      const image: any = await response.json();      
      const imgURL = image.imgURL;
      const prompt = image.prompt;    
      console.log(imgURL);
    
      if(imgURL.includes(' ')){
        await chatRef.current.updateGenImage(`![Image Could not be loaded](${encodeURIComponent(imgURL)}  "${prompt}")`);
      }else{
        await chatRef.current.updateGenImage(`![Image Could not be loaded](${imgURL} "${prompt}")`);
      }   
    }
    
  }

  // Handle the chat triggered from the context menu
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const menuInput = document.getElementById('menuInput') as HTMLInputElement | null;
    if(menuInput && menuInput.value.trim()){ 
      chatRef.current.chatFromExternal(menuInput.value.trim());
      menuInput.value = '';

      hideContextMenu();
      openChatbot();
    }
  }  

  const getSelectedText = () => {
    const selection = window.getSelection();
    let selectedText = '';
  
    for (let i = 0; i < selection.rangeCount; i++) {
      const range = selection.getRangeAt(i);
      if (selectedText) {
        selectedText += ' '; // Add a space between ranges
      }      
      selectedText += range.toString();
    }
  
    return selectedText;
  };  

  const handleMouseUp = (e: MouseEvent) => {
    setIsDragging(false);
    setIsProgressDragging(false);
    setIsSplitterDragging(false);

    const splitter = document.getElementById('splitter');
    splitter.style.backgroundColor = 'lightgray';    

    document.body.style.userSelect = 'auto'; // Restore text selection
    //document.body.classList.remove('no-select'); // Remove no-select class after dragging
    const menu = document.getElementById("contextMenu");
    const selectedText = window.getSelection().toString().trim().replace(/\n/g, ' ');
    //Max length supported by OpenAI API is 4096 for TTS model
    if(selectedText.length >= 4096){ return; }
  
    // If no text is selected, remove the popup    
    if (!selectedText) {
      if (e.target !== currentPopup && currentPopup) {
        currentPopup.remove();
        currentPopup = null;
        clearTimeout(popupTimeout);
      }

      if (!menu.contains(e.target as Node)) {
        hideContextMenu();
      }      

      /*
      const menuInput = document.getElementById('menuInput');
      if (e.target !== menuInput ) {
        hideContextMenu(); // Hide the context menu
      }*/
      return; // Exit early since no action is needed
    }

    if (selectedText && isConnectedRef.current) {

      const selection = window.getSelection();
      const range = selection.getRangeAt(0).getBoundingClientRect();

      menu.style.display = "block";
      const computedStyle = window.getComputedStyle(menu);
      const menuHeight = computedStyle.height;
      menu.style.display = "none";

      const y = range.top + window.scrollY + 30 + parseFloat(menuHeight) < window.innerHeight ? range.top + window.scrollY + 30 : range.top + window.scrollY - 30 - parseFloat(menuHeight);
      const x = range.left + window.scrollX;

      const wordCardLi = document.getElementById('wordCardLi');  
      const readAloudLi = document.getElementById('readAloudLi');  
      const translateLi = document.getElementById('translateLi');  
      const explainLi = document.getElementById('explainLi');
      if( selectedText.includes(' ') || selectedText.includes('\n') || selectedText.length>15 )  
      {// Not likely a single WORD selected, hide the wordCard
        wordCardLi.style.display = 'none';        
        readAloudLi.style.display = 'block';
        translateLi.style.display = 'block';
        //Explain function is low frequency, so hide it
        explainLi.style.display = 'none';
      }else{
        wordCardLi.style.display = 'block';
        readAloudLi.style.display = 'block';   
        translateLi.style.display = 'none';     
        explainLi.style.display = 'none';    
        wordCardLi.onclick = async (event) => {
          try{

            explainAndShowImage(selectedText);
            
          }catch(error){
            console.error('Error generating image:', error);
          }           
        };
      }
      
      
      //let selectionTxt = getSelectedText().trim();
      //readAloudLi.onclick = () => selectionTTS(selectedText);
      if(readAloudLi.style.display === 'block'){
        readAloudLi.onclick = () => {          
          // Read Aloud the selected text from LLM
          const client = clientRef.current;
          if(client.isConnected()){
              client.sendUserMessageContent([
              {
                type: `input_text`,
                text: `Read Aloud: ${selectedText} with slow speed and with clear and encourage tone. only output the read aloud content`,
              },
            ]);  
          }          
          
        };
      }

      if(translateLi.style.display === 'block'){
        translateLi.onclick = () => {
          translateSentence(selectedText);           
        };
      }      
      
      if(explainLi.style.display === 'block'){
        explainLi.onclick = () => {
          const openRightArrow = document.getElementById('openRightArrow');
          if(openRightArrow){
            openRightArrow.click();
          }          
          chatRef.current.chatFromExternal(`Explain '${selectedText}'`);        
        };
      }

      const searchVideosLi = document.getElementById('searchVideosLi');
      searchVideosLi.onclick = () => {
        const openRightArrow = document.getElementById('openRightArrow');
        if(openRightArrow){
          openRightArrow.click();
        }        
        chatRef.current.chatFromExternal(`Search videos about '${selectedText}'`);
      };

      const talkAboutSelection = document.getElementById('talkAboutSelection');
      talkAboutSelection.onclick = () => selectionTalkAbout(selectedText);
      showContextMenu(x, y);                   
    }   

  };

  let popupTimeout = null; // Global timeout variable to track dismissal
  let currentPopup = null; // To keep track of the current popup  
  const showPopup = (x, y, text) => {
    // Clear previous popup and timeout if it exists
    if (currentPopup) {
      currentPopup.remove();
      clearTimeout(popupTimeout);
      readAloudBuffer = null; // Clear the buffer
    }

    const popup = document.createElement('div');
    popup.id = 'readAloudPopup';
    //popup.className = 'read-aloud-popup';
    popup.textContent = 'Read Aloud';
    popup.style.position = 'absolute';
    popup.style.left = `${x + 10}px`; // Adjust position as needed
    popup.style.top = `${y + 10}px`; // Adjust position as needed
    popup.style.backgroundColor = '#fff';
    popup.style.border = '1px solid #000';
    popup.style.borderRadius = '4px';
    popup.style.padding = '5px';
    popup.style.cursor = 'pointer';
    popup.style.zIndex = '2001';
    popup.onclick = () => selectionTTS(text);
  
  // Attach mouse leave event to manage timeout
    popup.onmouseleave = () => {
      popupTimeout = setTimeout(() => {
        popup.remove();
        currentPopup = null; // Reset the current popup
        readAloudBuffer = null; // Clear the buffer
      }, 1000); // 3-second delay
    };

  // Clear the timeout if the mouse re-enters
    popup.onmouseenter = () => {
      clearTimeout(popupTimeout);
    };    

    document.body.appendChild(popup);
    currentPopup = popup;
    readAloudBuffer = null; // Clear the buffer
  };

  const updateProgress = (e: MouseEvent | React.MouseEvent<HTMLDivElement>) => {
      const progressBar = progressBarRef.current;
      if(progressBar)
      {
        const rect = (progressBar as HTMLDivElement).getBoundingClientRect();
        const offsetX = e.clientX - rect.left;
        const newProgress = (offsetX / rect.width) * 100;
        setProgress(newProgress);

        if (audioRef.current) {
          // Update the playback position based on newProgress          
          audioRef.current.currentTime = (newProgress / 100) * audioRef.current.duration;
        }
      }
  };

  /**
   * Converts a standard YouTube video URL to an embeddable URL.
   * @param {string} url - The original YouTube video URL.
   * @returns {string | null} - The embeddable YouTube URL or null if invalid.
   */
  function convertToEmbedUrl(url: string): string | null {
    // Regular expression to extract the video ID from the URL
    const videoIdMatch = url.match(/(?:youtube\.com\/.*v=|youtu\.be\/)([^&]+)/);
    
    // Check if a video ID was found
    if (videoIdMatch && videoIdMatch[1]) {
      const videoId = videoIdMatch[1];
      // Construct and return the embed URL
      return `https://www.youtube.com/embed/${videoId}`;
    } else {
      // Return null if the URL is not a valid YouTube video URL
      return null;
    }
  }    

  //Display the Video Popup
  useEffect(() => {
    const closeButton = document.getElementById('closePopup');
    const popupOverlay = document.getElementById('popupOverlay');
    const videoFrame = document.getElementById('videoFrame');  
    const searchBox = document.getElementById('searchBox');  
    const flashcardsContainer = document.getElementById('flashcardsContainer');

    const closeKeywords = document.getElementById('closeKeywords');
    const floatingKeywords = document.getElementById('floatingKeywords');
    const openKeywords = document.getElementById('openKeywords');

    if( closeButton && popupOverlay && videoFrame && searchBox) { 
    // Close the popup and stop the video
      closeButton.addEventListener('click', () => {
        (videoFrame as HTMLIFrameElement).src = '';
        popupOverlay.style.display = 'none';
        if(flashcardsContainer){
          (flashcardsContainer as HTMLDivElement).style.display = 'none';
        }

        (searchBox as HTMLInputElement).value = ''; // Clear the search box
      });
    }    

    if( closeKeywords && floatingKeywords && openKeywords) { 
      // Close the popup and stop the video
      closeKeywords.addEventListener('click', () => {
        floatingKeywords.style.display = 'none';
        //openKeywords.style.display = 'flex';
        openKeywords.style.display = 'none';
        });

        openKeywords.addEventListener('click', () => {
          floatingKeywords.style.display = 'block';
          openKeywords.style.display = 'none';
          });        
      }      

    return () => {
      //closeButton.removeEventListener('mouseup', handleMouseUp);
    };       

  }, []);      

  // Keydown event handling
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {

      const searchBox = document.getElementById('searchBox');        
      const chatInputBox = document.getElementById('chatInputBox'); 
      const menuInput = document.getElementById('menuInput');   
      //const webRTCMessage = document.getElementById('webRTCMessage');    
      
      if (e.code === 'Space') {
        //if (e.target !== searchBox || e.target !== chatInputBox) {
          if (e.target !== chatInputBox && e.target !== menuInput) {
          e.preventDefault(); // Prevent default space bar action (scrolling)        
          /*  
          if(isAudioExisting === false){
            //if no audio available, Space shortcut is used for Mute/Unmute GPT-Realtime
            if (muteBtnRef.current)
              muteBtnRef.current.click();
            return;
          } else{*/
            if (playPauseBtnRef.current) {
              playPauseBtnRef.current.click(); // Trigger the button click event

              const wavStreamPlayer = wavStreamPlayerRef.current;
              if(wavStreamPlayer){
                wavStreamPlayer.askStop = true; 
              } 
            }
          //} 
          
        }  
      } else if (e.code === 'Escape') {

        //closeRightArrowNew();

        // Close the popup when pressing the Escape key
        const popupOverlay = document.getElementById('popupOverlay');
        if (popupOverlay) {
          const videoFrame = document.getElementById('videoFrame');
          if (videoFrame) {
            (videoFrame as HTMLIFrameElement).src = '';
          }
          const imageFrame = document.getElementById('imageFrame');
          if (imageFrame) {
            (imageFrame as HTMLImageElement).src = '';
          }          

          if( popupOverlay.style.display === 'flex' ){
            popupOverlay.style.display = 'none';
          } else{
            closeRightArrowNew();
          }

          (searchBox as HTMLInputElement).value = ''; // Clear the search box

        }
      }
      else if(e.code === 'ArrowLeft'){
        const repeatPreviousLi = document.getElementById('repeatPreviousLi');
        if(repeatPreviousLi){
          repeatPreviousLi.click();
        }
      }
      else if(e.code === 'ArrowRight'){
        const repeatForwardLi = document.getElementById('repeatForwardLi');
        if(repeatForwardLi){
          repeatForwardLi.click();
        }
      }   
      else if(e.code === 'ArrowDown'){
        const repeatCurrentLi = document.getElementById('repeatCurrentLi');
        if(repeatCurrentLi){
          repeatCurrentLi.click();
        }
      }         
      else if (e.code === 'Enter') { 
        // When Enter is hit in the search box, search for the video       
        if (e.target === searchBox) {
          e.preventDefault();

          const searchValue = (searchBox as HTMLInputElement).value.trim();
          if (searchValue !== '') {
              if (searchBox) {
                searchBox.blur();                
                setTimerforSearchBox(searchValue);
                /*
                if(isPlaying){
                  if (playPauseBtnRef.current) {
                    playPauseBtnRef.current.click(); // Trigger the button click event
                  }  
                }*/
              }
              showVideofromYoutube(searchValue);
            }
          }        
        }       
      };
  
    document.addEventListener('keydown', handleKeyDown);
  
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  const setTimerforSearchBox = (searchValue: string) => {
    const searchBox = document.getElementById('searchBox');

    let count = 0;
    const maxDots = 3;
    const interval = 250; // Time in ms between updates
    animation = setInterval(() => {
        count = (count + 1) % (maxDots + 1); // Cycle between 0, 1, 2, 3
        (searchBox as HTMLInputElement).value = searchValue + ".".repeat(count);
    }, interval);       
  }

  const clearTimerforSearchBox = (info: string) => {
    const searchBox = document.getElementById('searchBox');

    if (animation) {
      clearInterval(animation); // Stop the animation
      if (searchBox) {
        (searchBox as HTMLInputElement).style.color = 'red'; // Reset the color
        (searchBox as HTMLInputElement).value = info; // Clear the search box
      }
    }    
  }

  const toggleAudio = async () => {
    if(isAudioExisting === false){ return; }
    if (audioRef.current && isHidden) {
      if (isPlaying) {
        //audio should be paused when User speaks or LLM speaks
        audioRef.current.pause();
      } else {
        try {
          //start playing or resuming audio
          audioRef.current.play();
        } catch (error) {
          console.error('Error playing audio:', error);
        }
      }
      setIsPlaying(!isPlaying);
    }
    if(videoRef.current && !isHidden) {
      if (isPlaying) {
        videoRef.current.pause();
      } else {
        try {
          videoRef.current.play();
        } catch (error) {
          console.error('Error playing video:', error);
        }
      }
      setIsPlaying(!isPlaying);
    }
  };

  /**
   * Utility for search news by google by addTool
   */
  async function performGoogleSearch(query: string): Promise<Array<{ title: string, url: string }>> {
    try {
      const response: Response = await fetch(`/api/serp/news?q=${encodeURIComponent(query)}`);

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const results: any = await response.json();
      console.log('Search results:', results);

      return results.map((item: any): { title: any; url: any } => ({
        title: item.title,
        url: item.link
      }));
    } catch (error) {
      console.error('Error in performGoogleSearch:', error);
      return [
        {
          title: '',
          url: ''
        }
      ];
    }
  }  

  // Handle function calls from the Chatbot
  // e.g. get_news, get_video, etc.
  const functionCallHandlerForChat = async (call): Promise<string> => {   
    const args = JSON.parse(call.function.arguments);
    if (call?.function?.name === "get_video") {     
      return performYoutubeSearch(args.query)
      .then((results) => {
        if (results.length > 0) {
          // Access the first result
          const firstResult = results[0];
          
          // Convert to embeddable URL
          const embedUrl = convertToEmbedUrl(firstResult.url);
          
          if (embedUrl) {
            // Assistant message of Chat will render the youtube video in iframe
            return `<iframe width="100%" height="60%" src="${embedUrl}" style={{ borderRadius: '9px'}} allowfullscreen></iframe></div><div><iframe width="100%" height="60%" src="${embedUrl}" style={{ borderRadius: '9px'}} allowfullscreen></iframe>`;
          } else {
            return 'Failed to convert to embeddable URL.';
          }
        } else {
          return 'No results found.';
        }
      })
      .catch((error) => {
        return 'Error occurred during YouTube search';
      });           
    } 
    return '';
  };

  const getIsMuted = () => {return isMuted;};

  const toggleFlashcards = () => {
    const popupOverlay = document.getElementById('popupOverlay');
    const flashcardsContainer = document.getElementById('flashcardsContainer');
    const videoFrame = document.getElementById('videoFrame');
    const imageFrame = document.getElementById('imageFrame');
    const popupContent = document.getElementById('popupContent');
    if (!popupOverlay || !flashcardsContainer) return;

    const isVisible =
      popupOverlay.style.display === 'flex' &&
      flashcardsContainer.style.display === 'flex';
    if (isVisible) {
      flashcardsContainer.style.display = 'none';
      popupOverlay.style.display = 'none';
      return;
    }
    // Show flashcards; hide other media
    (popupContent as HTMLIFrameElement).className = 'popup-content-flashcards';
    flashcardsContainer.style.display = 'flex';
    if (videoFrame) (videoFrame as HTMLIFrameElement).style.display = 'none';
    if (imageFrame) (imageFrame as HTMLImageElement).style.display = 'none';
    popupOverlay.style.display = 'flex';
  };  
  
  /*
   * Utility for search Videos by Youtube by addTool
   * it will be called back from Realtime API and a popup will be displayed
   */
  const showVideofromYoutube = async (query: string) => {

    const searchBox = document.getElementById('searchBox');
    const popupOverlay = document.getElementById('popupOverlay');
    const videoFrame = document.getElementById('videoFrame');
    const imageFrame = document.getElementById('imageFrame');
    const popupContent = document.getElementById('popupContent');
   
    performYoutubeSearch(query)
    .then((results) => {
      if (results.length > 0) {
        // Access the first result
        const firstResult = results[0];
        console.log(`Title: ${firstResult.title}`);
        console.log(`Original URL: ${firstResult.url}`);
        
        // Convert to embeddable URL
        const embedUrl = convertToEmbedUrl(firstResult.url);
        
        if (embedUrl) {
          console.log(`Embeddable URL: ${embedUrl}`);
          (videoFrame as HTMLIFrameElement).src = embedUrl;
          (videoFrame as HTMLIFrameElement).style.display = 'flex';
          (imageFrame as HTMLImageElement).style.display = 'none';

          const flashcardsContainer = document.getElementById('flashcardsContainer');
          if (flashcardsContainer) {
            (flashcardsContainer as HTMLDivElement).style.display = 'none';
          }          

          (popupContent as HTMLIFrameElement).className = 'popup-content-video';
          if (popupOverlay){
            popupOverlay.style.display = 'flex';
            clearTimerforSearchBox(query);
            (searchBox as HTMLInputElement).style.color = 'blue'; // Reset the color

            // Insert the video searched into the conversation list at the same time
            chatRef.current.updateVideo(`<iframe width="100%" height="95%" src="${embedUrl}" style={{ borderRadius: '9px'}} allowfullscreen></iframe>`);

            if(results.length > 1){
              const secondResult = results[1];            
              // Convert to embeddable URL
              const secondembedUrl = convertToEmbedUrl(secondResult.url);           
              if (secondembedUrl) {
                chatRef.current.updateVideo(`<iframe width="100%" height="95%" src="${secondembedUrl}" style={{ borderRadius: '9px'}} allowfullscreen></iframe>`);
              } 
            }

            /*
            if(results.length > 2){
              const thirdResult = results[2];            
              // Convert to embeddable URL
              const thirdembedUrl = convertToEmbedUrl(thirdResult.url);           
              if (thirdResult) {
                chatRef.current.updateVideo(`<iframe width="100%" height="95%" src="${thirdembedUrl}" style={{ borderRadius: '9px'}} allowfullscreen></iframe>`);
              }             
            }      */  

          }
        } else {
          clearTimerforSearchBox('Error occurred during video search.');
          console.log('Failed to convert to embeddable URL.');
        }
      } else {
        clearTimerforSearchBox('No results found.');
        console.log('No results found.');
      }
    })
    .catch((error) => {
      clearTimerforSearchBox('Error occurred during YouTube search');
      console.error('Error occurred during YouTube search:', error);
    });                    
  }
  
  /**
   * Utility for search Videos from Youtube by SERP_API
   */
  async function performYoutubeSearch(query: string): Promise<Array<{ title: string, url: string }>> {
    try {
  const response: Response = await fetch(`/api/serp/videos?q=${encodeURIComponent(query)}`);

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const results: any = await response.json();
      console.log('Search results:', results);

      return results.map((item: any): { title: any; url: any } => ({
        title: item.title,
        url: item.link
      }));
    } catch (error) {
      console.error('Error in performYoutubeSearch:', error);
      return [
        {
          title: '',
          url: ''
        }
      ];
    }
  }    

  const scrollToBottom = (element: HTMLElement) => {
    element.scrollTop = element.scrollHeight;
  };  

  const openRightPanel = () => {
    //openChatbot();

    /*
    const muteButton = document.getElementById('muteButton');
    if(muteButton){
      muteButton.style.display = 'none';
    }  */

    const rightArrow = document.getElementById('openRightArrow');
    if(rightArrow){
      rightArrow.style.display = 'none';
    }

    const closeRightArrow = document.getElementById('closeRightArrow');
    const rightPanel = rightRef.current;
    if(closeRightArrow){
      closeRightArrow.style.display = 'flex';

      const computedStyle = getComputedStyle(rightPanel);
      const rightPanelWidth = computedStyle.width;      

      const newCloseRightArrowRight = parseInt(rightPanelWidth, 10) + 15;
      closeRightArrow.style.right = `${newCloseRightArrowRight}px`;

      const captionDisplay = document.getElementById('captionDisplay');
      //const captionWidth = window.innerWidth - newCloseRightArrowRight - 15;
      const captionWidth = window.innerWidth - newCloseRightArrowRight - 38;
      if(isCaptionVisible && captionDisplay){
        captionDisplay.style.width = `${captionWidth}px`;
      }      

      /*
      const floatingKeywords = document.getElementById('floatingKeywords');
      if(floatingKeywords){
        floatingKeywords.style.left = `0px`;
        floatingKeywords.style.opacity = `0.5`;
      }*/

      const closeKeywords = document.getElementById('closeKeywords');
      if(closeKeywords){
        closeKeywords.click();
      }

    }        

  }

  const openChatbot = () => {
    setIsCloseRightPanelDisabled(false);

    const splitter = document.getElementById('splitter');
    const chatBot = document.getElementById('chatContainer');

    if((splitter as HTMLDivElement).style.display === 'flex'){   
      if(chatBot.style.display === 'none') {
        chatBot.style.display = 'flex';
        //conversationDivRef.current.style.display = 'none';        
      }
    }
    else{
      (splitter as HTMLDivElement).style.display = 'flex';
      rightRef.current.style.display = 'flex';
      chatBot.style.display = 'flex';
      //conversationDivRef.current.style.display = 'none';
    }

    scrollToBottom(rightRef.current);
    rightRef.current.scrollIntoView({ behavior: 'smooth' });

    openRightPanel();    
/*
    if(!isMuted){
      toggleMuteRecording();
    }*/
  }

  const toggleMuteRecording = async () => {
    if (wavRecorderRef.current && clientRef.current) {
      if (isMuted) {
        await unmuteRecording();

        const client = clientRef.current;
        if (client.isConnected()){
          //showConversation();
          //openChatbot();
        }         

      } else {
        await muteRecording();
      }
      setIsMuted(!isMuted);
    }

    const apiKey = localStorage.getItem('tmp::voice_api_key')
    if (apiKey == '' || !clientRef.current.isConnected() || isConnectionError) {
      setIsMuted(true);
    }       
    
  };

  /*
  * Unmute recording, the audio copilot by first unmuting the recording  
  */
  const unmuteRecording = async () => {
    //setIsMuted(false);
    //const wavRecorder = wavRecorderRef.current;
    const client = clientRef.current;
    if (client.isConnected()){
      setIsMuted(false);

      const wavRecorder = wavRecorderRef.current;      
      await wavRecorder.record((data) => client.appendInputAudio(data.mono));
      //for test, to trigger start of conversation      
      /*
      client.sendUserMessageContent([
        {
          type: `input_text`,
          text: `Hello!,I have a question`,
          //text: `For testing purposes, I want you to list ten car brands. Number each item, e.g. "one (or whatever number you are one): the item name".`
          //text: `Search a video about zebras`,
        },
      ]);*/
    } else {
      setIsMuteBtnDisabled(true);
      switchAudioCopilot('server_vad');
    }
  };    

  const muteRecording = async () => {
    const client = clientRef.current;
    if (client.isConnected()){
      setIsMuted(true);
      const wavRecorder = wavRecorderRef.current;
      await wavRecorder.pause();
    }
  };    

  /**
   * Switch between Audio Copilot On/Off
   */  
  const switchAudioCopilot = async (value: string) => {
    
    const client = clientRef.current;
    
    if(client.isConnected()) {  
      if(value === 'none') {
        await switchAudioCopilotOff();
      } else {
        await switchAudioCopilotOn();
      }
    }
    else{
      if(value === 'server_vad'){
        await switchAudioCopilotOn();
      }
    }    
  };

  /**
     * Switch to Audio Copilot On
     */
  const switchAudioCopilotOn = useCallback(async () => {
    const client = clientRef.current;

    // Set state variables
    startTimeRef.current = new Date().toISOString();
    setRealtimeEvents(realtimeEvents);
    setItems(client.conversation.getItems());
    setItems(items);
    await chatRef.current.updateItems(client.conversation.getItems());

    try{
      setIsConnectionError(false);
      // Connect to realtime API
  
      const apiKey = LOCAL_RELAY_SERVER_URL
        ? ''
        : localStorage.getItem('tmp::voice_api_key') ||
          prompt('OpenAI API Key') ||
          '';
      if(LOCAL_RELAY_SERVER_URL !== '') {
          console.log("Relay mode to connect to OpenAI: ", LOCAL_RELAY_SERVER_URL)
          await client.connect();
      } else if (apiKey !== '') {
        localStorage.setItem('tmp::voice_api_key', apiKey);

        // Update the latest instructions if new magzine is loaded
        client.updateSession({ instructions: instructions.current }); 

        client.realtime.apiKey = apiKey;        
        //await client.connect();        
        /*  To use the latest model: 'gpt-4o-realtime-preview-2024-12-17' 
                                  or 'gpt-4o-mini-realtime-preview-2024-12-17'
            with lower cost, call the inside logic of client.connect() directly */
        //And also avoid touching codes of RealtimeClient.connect() and RealtimeAPI.connect()        
        if (client.isConnected()) {
          throw new Error(`Already connected, use .disconnect() first`);
        }

        //Test the Ephemeral Key rather than using the static API key
        //Connect successfully, but model always reply: I'm sorry, but I can't assist with that request.
        /*
        const tokenResponse = await fetch("/api/session");
        const data = await tokenResponse.json();
        const EPHEMERAL_KEY = data.client_secret.value;     
        client.realtime.apiKey = EPHEMERAL_KEY;   
        console.log("Using Ephemeral Key to connect to OpenAI Realtime API:", EPHEMERAL_KEY); 
        */
        //End of Ephemeral Key test          

        // use mini model by default for saving cost: 'gpt-4o-mini-realtime-preview-2024-12-17'
        // select latest GA Model: 'gpt-realtime' for better quality
        await client.realtime.connect({ model: chatModelRef.current });

        client.updateSession();            
        /* End of inside logic client.connect() */

      } else {
        setIsMuteBtnDisabled(false);        
      }

    } catch (error) {
      setIsMuted(true);
      setIsMuteBtnDisabled(false);
      setIsConnectionError(true);
      console.error('Error playing audio:', error);
    }
  }, []);
    
  /**
   * switch to Audio Copilot Off
   */
  const switchAudioCopilotOff = useCallback(async () => {
    setIsConnected(false);

    const client = clientRef.current;
    client.disconnect();

    const wavRecorder = wavRecorderRef.current;
    await wavRecorder.end();

    const wavStreamPlayer = wavStreamPlayerRef.current;
    await wavStreamPlayer.interrupt();   

  }, []);

  /** Test for capturing audio from other apps
   * Capture audio from other apps, e.g. Microsoft Teams, 
   * This could be a new feature for Audio Copilot to prepare an reference answer when user is 
   * in an interview or in a customer-facing issue resolution.
   */
  async function captureAudioToPCM16() {
    const stream = await navigator.mediaDevices.getDisplayMedia({ audio: true });
    const audioContext = new AudioContext();
    const source = audioContext.createMediaStreamSource(stream);

    const processor = audioContext.createScriptProcessor(4096, 1, 1);
    source.connect(processor);
    processor.connect(audioContext.destination);

    processor.onaudioprocess = (audioEvent) => {
        const float32Data = audioEvent.inputBuffer.getChannelData(0);
        const pcm16Data = new Int16Array(float32Data.length);

        // Convert Float32 to PCM16
        for (let i = 0; i < float32Data.length; i++) {
            let s = Math.max(-1, Math.min(1, float32Data[i]));
            pcm16Data[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
        }

        // pcm16Data now contains the PCM16 audio data
        console.log(pcm16Data);
        // You can now send pcm16Data to a server, save to file, etc.
    };
  }
//captureAudioToPCM16();

  /**
   * Utility for formatting the timing of logs

  const formatTime = useCallback((timestamp: string) => {
    const startTime = startTimeRef.current;
    const t0 = new Date(startTime).valueOf();
    const t1 = new Date(timestamp).valueOf();
    const delta = t1 - t0;
    const hs = Math.floor(delta / 10) % 100;
    const s = Math.floor(delta / 1000) % 60;
    const m = Math.floor(delta / 60_000) % 60;
    const pad = (n: number) => {
      let s = n + '';
      while (s.length < 2) {
        s = '0' + s;
      }
      return s;
    };
    return `${pad(m)}:${pad(s)}.${pad(hs)}`;
  }, []);*/

  /**
   * When you click the API key
   */
  const resetAPIKey = useCallback(() => {
    const apiKey = prompt('OpenAI API Key');
    if (apiKey !== null) {
      localStorage.clear();
      localStorage.setItem('tmp::voice_api_key', apiKey);
      //window.location.reload();
    }
  }, []);

  const deleteConversationItem = useCallback(async (id: string) => {
    const client = clientRef.current;
    client.deleteItem(id);
  }, []);

  /**
   * Auto-scroll the event logs
   */
  useEffect(() => {
    if (eventsScrollRef.current) {
      const eventsEl = eventsScrollRef.current;
      const scrollHeight = eventsEl.scrollHeight;
      // Only scroll if height has just changed
      if (scrollHeight !== eventsScrollHeightRef.current) {
        eventsEl.scrollTop = scrollHeight;
        eventsScrollHeightRef.current = scrollHeight;
      }
    }
  }, [realtimeEvents]);

  /**
   * Auto-scroll the conversation logs
   */
  useEffect(() => {
    const conversationEls = [].slice.call(
      document.body.querySelectorAll('[data-conversation-content]')
    );
    for (const el of conversationEls) {
      const conversationEl = el as HTMLDivElement;
      conversationEl.scrollTop = conversationEl.scrollHeight;
    }
  }, [items]);

  interface VoiceControlClickEvent extends React.MouseEvent<HTMLDivElement> {
    stopPropagation: () => void;
  }

  const handleVoiceControlClick = (event: VoiceControlClickEvent, voice: 'ash' | 'alloy' | 'ballad' | 'coral' | 'echo' | 'sage' | 'shimmer' | 'verse'): void => {
    event.stopPropagation(); // Prevent the event from bubbling up to the progress bar

    setRtVoice(voice);
    console.log(`Speed set to ${voice}`);
  };    

  /**
   * Core RealtimeClient and audio capture setup
   * Set all of our instructions, tools, events and more
   */
  useEffect(() => {
    // Get refs
    const wavStreamPlayer = wavStreamPlayerRef.current;
    const client = clientRef.current;

    // Set the modalities - To disable audio, set this to ['text'] only
    // !!! Set modalities as following will lead to other setting not working, e.g. voice, function calling
    //client.updateSession({ modalities: ['text', 'voice'] });
    // Set the voice type
    //client.updateSession({ voice: rtVoice });
    client.updateSession({ voice: "alloy" }); // set default voice as "alloy"
    // Set instructions->to be set when a new magazine is loaded or default instructions set before connecting
    //client.updateSession({ instructions: instructions });
    // Set transcription, otherwise we don't get user transcriptions back
    client.updateSession({ input_audio_transcription: { model: 'whisper-1' } });

    // hanks - Set turn detection to server VAD by default
    client.updateSession({ turn_detection: { type: 'server_vad' } });    
    // hanks

    // Search news from google
    client.addTool(
      { //Capabilities demo: when a listener wants to ask for a google search
        name: 'google_search',
        description:
          'Performs a Google News search and returns the top 2 results.',
        parameters: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description: 'The search query to be used.',
            },           
          },
          required: ['query'],
        },
      },
      async({ query }: { query: string }) => {
        return await performGoogleSearch(query);
      }
    );    
    // Search a video from Youtube 
    client.addTool(
      { 
        name: 'youtube_search',
        description:
          'Performs a Youtube video search and returns the top 1 results.',
        parameters: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description: 'The search query to be used.',
            },           
          },
          required: ['query'],
        },
      },
      async({ query }: { query: string }) => {

        // To show the loading animation in the search box when searching for the video
        // Clear the search box and show the loading animation
        const searchBox = document.getElementById('searchBox');  
        if (searchBox) {
          (searchBox as HTMLInputElement).value = query; // Clear the search box

          let count = 0;
          const maxDots = 3;
          const interval = 250; // Time in ms between updates
          animation = setInterval(() => {
              count = (count + 1) % (maxDots + 1); // Cycle between 0, 1, 2, 3
              (searchBox as HTMLInputElement).value = query + ".".repeat(count);
          }, interval);            

        }        

        await showVideofromYoutube(query);        
        //return imageDescriptionRef.current;
        //return imageDescription;

        if(!isMuteBtnDisabled && !isMuted){
          muteBtnRef.current.click();
        }        

        return { ok: true };

      }
    );        
    // Describe the selected image screenshot 
    /*
    client.addTool(
      { 
        name: 'image_describe',
        description:
          'Describe the image.',
        parameters: {
          type: 'object',
          properties: {
            imgURL: {
              type: 'string',
              description: 'The image URL to be used',
            },           
          },
          required: ['imgURL'],
        },
      },
      async({ imgURL }: { imgURL: string }) => {

        //return await analyzeImage(imgURL);
        return  imageDescription;

      }
    );       */  
    // Word Card: Explain the selected word       
    client.addTool(
      { 
        name: 'selection_analyze',
        description:
          'Show word card',
        parameters: {
          type: 'object',
          properties: {
            selection: {
              type: 'string',
              description: 'word selected',
            },           
          },
          required: ['selection'],
        },
      },
      async({ selection }: { selection: string }) => {
        //return await analyzeImage(imgURL);
        explainAndShowImage(selection);
        return { ok: true };
        //return  'This is a beautiful image';
      }
    ); 
    // Ask DeepSeek: Chat with deepseek by provided prompt       
    client.addTool(
      { 
        name: 'ask_deepseek',
        description:
          `Ask DeepSeek a question by provided prompt
            #Details
            - Note that this function call can take up to 10 seconds, so please provide small updates to the user every few seconds, like 'I just need a little more time'
          `,
        parameters: {
          type: 'object',
          properties: {
            prompt: {
              type: 'string',
              description: 'prompt for asking DeepSeek',
            },           
          },
          required: ['prompt'],
        },
      },
      async({ prompt }: { prompt: string }) => {
        const response = await askDeepSeekByPrompt(prompt);
        if(response){
          return { ok: true, deepSeekResponse: response, replyByYourself:'No, reply directly with deepseek reply starting by Here is the deepseek reply:' };
        }
        return { ok: false, deepSeekResponse: 'No response available from DeepSeek', replyByYourself: 'Yes, you can try to answer the question by yourself starting by Here is my reply due to DeepSeek unavailable now:' };             
      }     
    );             
    // Image Creation: Create an image by provided prompt       
    client.addTool(
      { 
        name: 'image_creation',
        description:
          'Create an image or a picture by provided prompt',
        parameters: {
          type: 'object',
          properties: {
            prompt: {
              type: 'string',
              description: 'prompt for image/picture creation',
            },           
          },
          required: ['prompt'],
        },
      },
      async({ prompt }: { prompt: string }) => {
        createImageByPrompt(prompt);
        return { ok: true };
      }
    );         
    // Voice control the on-going playback
    client.addTool(
      { //Voice commands to control the on-going playback, e,g. pause, resume, speed up, speed down, 
        //skip forward, skip backward, volume up, volume down, peek the current time of the audio
        name: 'audio_control',
        description:
          'Voice control the on-going playback. e.g. stop the audio, speed up or down the audio',
        parameters: {
          type: 'object',
          properties: {
            context: {
              type: 'string',
              description: 'additional information to control the audio',
            },
            command: {
              type: 'string',
              description: 'commoand to control the audio',
            },
          },
          required: ['context', 'command'],
        },
      },
      async ({ context, command }: { [key: string]: any }) => {
        //const audio = audioRef.current;
        const wavStreamPlayer = wavStreamPlayerRef.current;

        wavStreamPlayer.askStop = false;

        if (command === 'pause') {
          wavStreamPlayer.askStop = true;
        } else if (command === 'resume') {
          wavStreamPlayer.askStop = false;
        } else if (command === 'speed') {
          if (context === 'up') {
            setPlaybackRate(playbackRate + 0.25);
          } else if (context === 'down') {
            setPlaybackRate(playbackRate - 0.25);
          } else if (context === 'normal') {
            setPlaybackRate(1.0);
          }
        } else if (command === 'skip') {  
          if ( audioRef.current ) {
            if (context === 'forward') {
              audioRef.current.currentTime += 10;
            } else if (context === 'backward') {
              audioRef.current.currentTime -= 10;
              if (audioRef.current.currentTime < 0) {
                audioRef.current.currentTime = 0;
              }
            } else if ( context == 'start') {
              audioRef.current.currentTime = 0;
            }
          }
        } else if ( command === 'volume') {
          if (audioRef.current) {
            if (context === 'up') {
              audioRef.current.volume = Math.min(audioRef.current.volume + 0.1, 1.0);
            } else if (context === 'down') {
              audioRef.current.volume = Math.max(audioRef.current.volume - 0.5, 0.0);
            }
          }          
        } else if ( command === 'peek') {  
          if (audioRef.current) {
            return { ok: true, currentTime: audioRef.current.currentTime, duration: audioRef.current.duration };
          }
          
        }  
        return { ok: true };
      }
    );        
    // Translation of the current sentence
    client.addTool(
      { //Jury's feedback: What if it could interpret what Copilot hear into local language in realtime? 
        //e.g. Copilot hears English, and translate it into Chinese in realtime
        //This helps listeners to consume the audio in the local language
        name: 'translation_current_sentence',
        description:
          'translate the current sentence to the target language, by default, it is Chinese if not specified target language',
        parameters: {
          type: 'object',
          properties: {
            target_lan: {
              type: 'string',
              description: 'target language',
            },
          },          
        },
      },
      async ({ target_lan }: { [key: string]: any }) => {
        if ( audioRef.current ) {
          if (target_lan === null) {
            return { ok: true, target_lan: 'zh', currentTime: audioRef.current.currentTime, duration: audioRef.current.duration};
          } else {
            return { ok: true, target_lan: target_lan, currentTime: audioRef.current.currentTime, duration: audioRef.current.duration  };
          }
        } else {
          return { ok: false, info: 'No audio file is playing' };
        }
        
      }
    );    
    // Dive in the content by the keyword
    client.addTool(
      { //When a listener wants to learn or explore the content of the audio by the keyword
        name: 'learn_by_keyword',
        description:
          'learn the content of the audio by the keyword',
        parameters: {
          type: 'object',
          properties: {
            keyword: {
              type: 'string',
              description: 'topic keyword to learn/explore',
            },
          },          
        },
      },
      async ({ keyword }: { [key: string]: any }) => {       
        if( keyword in Keywords.current) {
          const range = Keywords.current[keyword as keyof typeof Keywords.current];
          return [range[0], range[1]];
        } else {
          return { ok: false, info: 'No such a keyword' };
        }
      }
    );        
    // Collecting Feedback
    client.addTool(
      { //Capabilities demo: when a lister wants to provide feedback
        //or similarly, sharing it to a friend...
        name: 'feedback_collection',
        description:
          'Collect feedback from the user. e.g. feedback on the company AI first strategy...',
        parameters: {
          type: 'object',
          properties: {
            title: {
              type: 'string',
              description: 'feedback title',
            },
            content: {
              type: 'string',
              description: 'feedback content',
            },
          },
          required: ['title', 'content'],
        },
      },
      async ({ title, content }: { [key: string]: any }) => {
        return { ok: true, info: 'Thanks for your feedback' };
      }
    );
    // Search realtime stock price
    client.addTool(
      { //Capabilities demo: to retrieve the latest stock for a given company
        //e.g. get_stock_price(company: 'SAP') when valuation of SAP is heard, 
        //user is just a tiny SAP stock holder and want to check the latest SAP stock prcie 
        name: 'get_stock_price',
        description:
          'Retrieves the latest stock price for a given comppany. ',
        parameters: {
          type: 'object',
          properties: {
            company: {
              type: 'string',
              description: 'Name of the company',
            },
          },
          required: ['company'],
        },
      },
      async ({ company }: { [key: string]: any }) => {
        /*
        const result = await fetch(
          `https://api.openai.com/v1/stock_price?company=${company}`
        );*/
        const result = {
          ok: true,
          date: '2024-10-25',
          company: 'SAP',
          price: 237.69,
          currency: 'USD',
        };
        //const json = await result.json();
        return result;
      }
    );    
    // Send mail to a friend
    client.addTool(
      { //Capabilities demo: when a listener wants to send a mail to a friend
        name: 'send_mail',
        description:
          'help the user to send the mail to a specific Recipient',
        parameters: {
          type: 'object',
          properties: {
            title: {
              type: 'string',
              description: 'feedback title',
            },
            content: {
              type: 'string',
              description: 'feedback content',
            },
            to: {
              type: 'string',
              description: 'mail receiver',
            },            
          },
          required: ['query'],
        },
      },
      async ({ title, content }: { [key: string]: any }) => {
        return { ok: true, info: 'Thanks for mail' };
      }
    );
    // hanks

    // handle realtime events from client + server for event logging
    client.on('realtime.event', (realtimeEvent: RealtimeEvent) => {
      setRealtimeEvents((realtimeEvents) => {
        const lastEvent = realtimeEvents[realtimeEvents.length - 1];
        if (lastEvent?.event.type === realtimeEvent.event.type) {
          // if we receive multiple events in a row, aggregate them for display purposes
          lastEvent.count = (lastEvent.count || 0) + 1;
          return realtimeEvents.slice(0, -1).concat(lastEvent);
        } else {
          return realtimeEvents.concat(realtimeEvent);
        }
      });
    });
//  client.on('error', (event: any) => console.error(event));
    client.on('error', (event: any) => {
      console.error(event);
    });
    client.on('conversation.interrupted', async () => {
      const trackSampleOffset = await wavStreamPlayer.interrupt();
      if (trackSampleOffset?.trackId) {
        const { trackId, offset } = trackSampleOffset;
        await client.cancelResponse(trackId, offset);
      }  
    });
    client.on('conversation.updated', async ({ item, delta }: any) => {
      // hanks - Resume audio when item is 'completed'
      wavStreamPlayer.setItemStatus(item.status);
      wavStreamPlayer.isHidden = isHidden;
      // hanks 

      const items = client.conversation.getItems();
      if (delta?.audio) {
        wavStreamPlayer.add16BitPCM(delta.audio, item.id);
      }
      if (item.status === 'completed' && item.formatted.audio?.length) {
        const wavFile = await WavRecorder.decode(
          item.formatted.audio,
          24000,
          24000
        );
        item.formatted.file = wavFile;        
      }
      setItems(items);

      // Pass the latest items to the chat component
      // This will trigger a re-render of the chat component,e.g transcript will be updated
      // audio stream will be decoded and replayed in the chat lis
      await chatRef.current.updateItems(items);
    });
    client.on('conversation.item.completed', ({ item }) => {
      if (item.type === 'function_call') {
        // your function call is complete, execute some custom code
        console.log("function call completed", item);
      }
    });    
    // hanks 
    client.realtime.on('server.error', () => {
      console.error("Error from server");
    });    
    // hanks - Pause on-going playback when speech is detected
    client.realtime.on('server.input_audio_buffer.speech_started', () => {
      if (audioRef.current){
        audioRef.current.pause();
        setIsPlaying(false);
      }      
      if (videoRef.current){
        videoRef.current.pause();
        setIsPlaying(false);
      }
    });   
    // hanks - Record the conversation items into the Chatbot history list
    client.realtime.on('server.conversation.item.created', async (event) => {
      const { item, delta } = client.conversation.processEvent(event);
      await chatRef.current.updateItems(client.conversation.getItems());

      // insert one audio message to the chat list
      await chatRef.current.updateItemID(item.id); 
    });      
    // Copilot will be activated after clicking the Connect button on the top-right corner
    // Copilot/speaker will be muted by default to avoid unwanted interuption/cost
    client.realtime.on('server.session.created', async () => {
      //session.created is first server event received when a new connection is established
      //Ensure Mute/Unmute button is only active after both the connection is established and the recording is started
      const intervalId = setInterval(() => {
        if ('paused' === wavRecorderRef.current.getStatus()) {
          clearInterval(intervalId);
          setIsMuteBtnDisabled(false);
        }
      }, 100);      

      const wavRecorder = wavRecorderRef.current;
      const wavStreamPlayer = wavStreamPlayerRef.current;      

      // Connect to microphone
      if(wavRecorder.processor === null) {
        await wavRecorder.begin();
      }

      // Connect to audio output
      // Enhanced with one parameter to resume playback when reply speek is finished
      await wavStreamPlayer.connect(audioRef.current, videoRef.current, setIsPlaying, repeatCurrent);
      wavStreamPlayer.askStop = true;      

      setIsConnected(true);
    });      
    // hanks

    setItems(client.conversation.getItems());
    chatRef.current.updateItems(client.conversation.getItems());

    return () => {
      // cleanup; resets to defaults
      client.reset();
    };
  }, []);

  // Test Floating Button
  interface DragEvent extends React.MouseEvent<HTMLDivElement> {
    clientX: number;
    clientY: number;
  }

  interface FloatingButtonElement extends HTMLDivElement {
    dragOffsetX: number;
    dragOffsetY: number;
  }

  const handleDragStart = (e: DragEvent): void => {
    const button = floatingButtonRef.current;
    if (button) {
      const rect = (button as FloatingButtonElement).getBoundingClientRect();
      (button as FloatingButtonElement).dragOffsetX = e.clientX - rect.left;
      (button as FloatingButtonElement).dragOffsetY = e.clientY - rect.top;
    }
  };

  interface DragEvent extends React.MouseEvent<HTMLDivElement> {
    clientX: number;
    clientY: number;
  }

  interface FloatingButtonElement extends HTMLDivElement {
    dragOffsetX: number;
    dragOffsetY: number;
  }

  const handleDrag = (e: DragEvent): void => {
    if (e.clientX === 0 && e.clientY === 0) return; // Ignore invalid drag events
    const button = floatingButtonRef.current as FloatingButtonElement | null;
    if (button) {
      button.style.left = `${e.clientX - button.dragOffsetX}px`;
      button.style.top = `${e.clientY - button.dragOffsetY}px`;
    }
  };
  // Test Floating Button

  /**
     * Disconnect and reset conversation state
     */
  const disconnectConversation = useCallback(async () => {
    setIsConnected(false);
    setRealtimeEvents([]);
    setItems([]);
    await chatRef.current.updateItems([]);

    const client = clientRef.current;
    client.disconnect();

    const wavRecorder = wavRecorderRef.current;
    await wavRecorder.end();

    const wavStreamPlayer = wavStreamPlayerRef.current;
    await wavStreamPlayer.interrupt();

    setIsMuteBtnDisabled(false);
    setIsMuted(true);
  }, []);  

  /**
   * Disconnect and reset conversation state
   */
  const disConnnectRealtimeAPI = async () => {
    disconnectConversation();
    //closeRightArrowNew();
  }

  /**
   * Connect and start conversation/Chatbot
   */
  const connnectRealtimeAPI = async () => {
    if(muteBtnRef.current) {
      muteBtnRef.current.click(); // Trigger the button click event   
    }      
  };  

  const checkConnection = () => {
    // Replace this with your actual connection check logic
    //console.log('Checking connection...');
    // Example: Check if the realtime client is connected
    if (clientRef.current && clientRef.current.isConnected()) {
      //console.log('Connected');
    } else {
      //console.log('Not connected');
      setIsConnected(false);      
      // if connection is lost anaccidentally, recorder processor will not be null
      //  => disconnect and reset the conversation state
      // if connection is lost mannually by clicking disconnect button
      //  => disConnnectRealtimeAPI() is already called and recorder processor is set as null;
      // if connection is not set up yet(first time), recorder processor will be null
      if( wavRecorderRef.current && wavRecorderRef.current.processor ) {
        disConnnectRealtimeAPI();
      }
      //connnectRealtimeAPI();
    }
  };

  let menuTimeout = null; // Global timeout variable to track dismissal  
  function showContextMenu(x, y) {
    const menu = document.getElementById("contextMenu");
    menu.style.left = `${x}px`;
    menu.style.top = `${y}px`;
    menu.style.display = "block";

    // Attach mouse leave event to manage timeout
    menu.onmouseleave = () => {
      menuTimeout = setTimeout(() => {
        menu.style.display = "none";
      }, 1000); // 3-second delay
    };

    // Clear the timeout if the mouse re-enters
    menu.onmouseenter = () => {
        clearTimeout(menuTimeout);
      };        

  } 

  function hideContextMenu() {
    const menu = document.getElementById("contextMenu");
    const menuInput = document.getElementById('menuInput');   

    (menuInput as HTMLInputElement).value = '';
    menu.style.display = "none";
  }  
 

  useEffect(() => {
    // Set up the interval to check the connection every 3 seconds
    const intervalId = setInterval(checkConnection, 3000);

    // Cleanup the interval on component unmount
    return () => {
      clearInterval(intervalId);
    };
  }, [clientRef.current]);

  //Test for variable evaluation in template string dynamically
  let audioUrl = "";
  let transcript = "";
  const getMarkdownContent = () => `
  ${transcript}  
  <audio src="${audioUrl}" controls></audio>
  `;   

  /**
   * Render the application
   */
  return (
    <div data-component="ConsolePage">
      
      {/* Popup Layer for display the video from youtube search triggered by Realtime API  */}      
      <div id="popupOverlay" className="popup-overlay">
        <div id="popupContent" className="popup-content-chat">
          <span id="closePopup" className="close-button"><X /></span>
          {/* Show flashcards here */}
          <div id="flashcardsContainer"
               style={{
                display: 'none',
                width: '100%',
                height: '100%',
                flexDirection: 'column',
                justifyContent: 'center',
                alignItems: 'center',
                backgroundColor: 'lightgrey'
              }}> <Flashcards cards={flashcards} realtimeClient={clientRef.current} /></div>
          <iframe id="videoFrame" width="800" height="450" src="" allow="fullscreen" allowFullScreen style={{display: 'none'}}></iframe>
          <img id="imageFrame" src="" alt="Image"
                onDoubleClick={() => {
                  const popupOverlay = document.getElementById('popupOverlay');
                  const imageFrame = document.getElementById('imageFrame');                      
                  if(popupOverlay.style.display === 'flex'){
                    popupOverlay.style.display = 'none';
                    (imageFrame as HTMLImageElement).style.display = 'none';
                    (imageFrame as HTMLImageElement).src = '';
                  }            
                }}
                style={{display: 'none', borderRadius: '8px'}}>                  
          </img>
        </div>
      </div>

      {/* wordCard when text selected  */}  
      <div id='wordCard' style={{position: 'absolute', display: 'none'}}>
       {/* <img id='wordCardImg' src={imgURL} alt='Word Card' style={{width: '200px', height: '200px'}}></img> */} 
      </div>

      {/* ContextMenu when text selected  */}   
      <div id="contextMenu" style={{position: 'absolute', display: 'none'}}>
        <ul>
          <li id='wordCardLi'>Word Card/词卡</li>
          <li id='readAloudLi'>Read Aloud/朗读</li>
          <li id='translateLi'>Translate/翻译</li>
          <li id='explainLi'>Explain/解释一下</li>
          <li id='searchVideosLi'>Youtube相关视频推荐</li>
          <li style={{display: 'none'}}>Search the web</li>
          <li id='talkAboutSelection'>Deep Dive/深入了解</li>
          <li>
            <form onSubmit={handleSubmit}>
              <input id='menuInput' placeholder="Ask me anything..." style={{marginRight: '5px'}}></input>
              <button type='submit'>Ask</button>             
            </form>
          </li>
        </ul>
      </div>

      {/* Hide openKeywords due to bottom keywords popup control */}
      <div id="openKeywords" className="floating-open-button" onClick={openKeywords} style={{display: 'none'}} title='Selec a Keyword to dive in'><BookOpen style={{ width: '18px', height: '18px' }} /></div>
      {/* Click keyword to go to specific page and seek the current time */}
      <ul id="floatingKeywords" className="floating-keywords" style={{display: 'none'}}> 
        <span id="closeKeywords" className="close-button-keywords"><X /></span>
        <div style={{position:'absolute', top: '10px', left: '10px', zIndex: '9990', fontWeight: 'bold', userSelect: 'none'}} title='Select a keyword to dive in'>Keywords<Key style={{width: '15px', height: '15px'}} /></div><br />
        {Object.entries(Keywords.current as Record<string, [number, number, number]>).map(([key, [value1, value2, value3]], index) => value3 !== 0 && (
          <li
            key={index} // Use index as the key for React
            className={`hover-effect ${keyword === key ? 'active' : ''}`}
            style={{
              //backgroundColor: keyword === key ? '#666' : '#f9f9f9', // Darker if active
              //color: keyword === key ? '#fff' : '#000', // Adjust text color for contrast
              borderRadius: '0.3125em',
              whiteSpace: 'nowrap',
            }}
            //onClick={(e) => handleKeywordClick(e, key, value1, value2, value3)} // Directly play the keyword segment
            onClick={(e) => loopKeywordPlay(e, key, value1, value2, value3)} // Loop play the keyword segment
          >
            {index+1}.{key} {/* Display the key */}
          </li> 
        ))}
      </ul>

      {/* Floating buttons for control the caption size and repeat current/last caption */}
      <ul className="floating-captionsize" style={{display: !isCaptionVisible && 'none' }}>
        <li onClick={repeatCurrent}id='repeatCurrentLi'  title='Repeat current caption'><Repeat style={{ width: '15px', height: '15px' }} /></li>
        <li onClick={repeatPrevious} id='repeatPreviousLi'><SkipBack style={{ width: '15px', height: '15px' }} /></li>
        <li onClick={repeatForward} id='repeatForwardLi'><SkipForward style={{ width: '15px', height: '15px' }} /></li>
        <li onClick={showTranslateCurrentCaption} title='Translation'><Globe style={{ width: '15px', height: '15px' }} /></li>
        <li onClick={() => adjustCaptionFontSize(+0.1)}><ZoomIn style={{ width: '15px', height: '15px' }} /></li>
        <li onClick={() => adjustCaptionFontSize(-0.1)}><ZoomOut style={{ width: '15px', height: '15px' }} /></li>
      </ul>
      {/* Test Floating button */}
      <div className="floating-button" ref={floatingButtonRef}  
             onMouseDown={handleDragStart}
             onMouseMove={handleDrag}
             style={{display: "none"}}
        >
          <Button
            style={{ height: '10px'}}
            label={'WebRTC Test'}
            buttonStyle={'flush'}
            //onClick={showConversation}
            className='button'
          />
        </div>      
      { (items.length < 0) && (!isCaptionVisible) &&
        <div className="floating-button" ref={floatingButtonRef}  
             onMouseDown={handleDragStart}
             onMouseMove={handleDrag}
        >
          <Button
            style={{ height: '10px'}}
            label={'Conversation List'}
            buttonStyle={'flush'}
            onClick={showConversation}
            className='button'
          />
        </div>
      }    

      {/* Top buttons in row to control PDF operation */}
      <div className="top-hover-area">
        <div className="arrowdown" style={{display:'none'}}></div>
        <div id='button-row-top' className='button-row-top'>
          <div style={{display: 'none'}}>
            <Plus style={{ width: '20px', height: '20px', marginLeft: '2px', cursor: 'pointer' }} onClick={zoomIn}/>
            <Minus style={{ width: '20px', height: '20px', marginLeft: '2px', cursor: 'pointer' }} onClick={zoomOut}/>
          </div>
          <Button
            style={{height: '10px'}}
            label={''}
            icon={Plus}
            buttonStyle={'flush'}
            onClick={zoomIn}
            className='button'
          />
          <Button
            style={{height: '10px'}}
            label={''}
            icon={Minus}
            buttonStyle={'flush'}
            onClick={zoomOut}
            className='button'
          />   
          <Button
            style={{height: '10px'}}
            label={''}
            icon={Layout}
            buttonStyle={'flush'}
            onClick={togglePageView}
            className='button'
            title={isTwoPageView ? 'Single Page View' : 'Two Page View'}
          />                    
          <div title={isTwoPageView ? 'Single Page View' : 'Two Page View'} style={{display: 'none'}}>
            <Layout style={{ width: '20px', height: '20px', marginLeft: '2px', cursor: 'pointer' }} onClick={togglePageView}/>
          </div>               
          <div className='magzine-title' style={{height: '25px', justifyContent: 'center', marginLeft: 'auto', marginRight: 'auto', userSelect: 'none'}}><img id='imgRecraft' src='./resource/ngl.png' width="70px" height="20px" style={{marginRight: "5px"}}></img>{newMagzine}
          </div>                    
          <div className="right-buttons" style={{userSelect: 'none'}}>
            {/*<div style={{ fontSize: '1em' }}>{isConnected ? ( <> Copilot: <span className="highlightgreen">On</span> </> ) : (isMuteBtnDisabled ? startingText : (isConnectionError ? ( <><span className="highlightred">Error Occurred!</span></> ) : ( <> Copilot: <span className="highlightred">Off</span> </> )) )}</div> */}
            <div>
              <Button
                  label={isConnected ? 'Disconnect' : (isMuteBtnDisabled ? startingText : 'Connect\u00A0\u00A0\u00A0' ) }
                  iconPosition={isConnected ? 'end' : 'start'}
                  icon={isConnected ? X : Zap}
                  //buttonStyle={isConnected ? 'regular' : 'action'}
                  disabled={isMuteBtnDisabled}
                  onClick={ isConnected ? disConnnectRealtimeAPI : connnectRealtimeAPI }
                />    
            </div>                     
            <div className="content-api-key" style={{display: 'none'}}>
              {!LOCAL_RELAY_SERVER_URL && (
                <Button
                  //icon={Edit}
                  icon={Layout}
                  iconPosition="end"
                  buttonStyle="flush"
                  label={`\u00A0`}
                  title="Reset the OpenAI API Key"
                  onClick={() => resetAPIKey()}
                />
              )}
            </div>             
          </div>      
        </div>
      </div>

      <div className="content-main" ref={leftRef}>
        {/* Left Area to display PDF Magzine */}
        {/*First div is to control display the scrollbar*/}                
        <div id="pdfContainer" style={{
          display: 'flex',        // Enable flexbox
          position: 'relative',   // Enable absolute positioning
          //display: 'none',        // Enable flexbox
          margin: '0 auto',       // Center horizontally
          //marginTop: '2.5em', 
          width: '100%',           // Adjust the width as needed
          overflowY: 'auto',      // Enable scrolling
          scrollbarWidth: 'auto',
          //top: '400px', 
          top: '0px', 
        }}>
          <div className="top-floating-line"></div>
          <div ref={containerRef}  // Attach zoom handler to this container only
                    style={{       
                      margin: '0 auto',       // Center horizontally
                      width: '100%',           // Adjust the width as needed
                      overflowY: 'auto',      // Enable scrolling
                      scrollbarWidth: 'none', // Hide scrollbar 
                      //top: '400px',               // Top of the viewport
                      top: '0px',               // Top of the viewport
                      backgroundColor: 'white', // Optional: background color
                      transform: `scale(${scale})`, // Apply CSS transform for zooming
                      transformOrigin: 'top center', // Set the origin for the transform                    
                }}>
            {/*<Document file={pdfFilePath} onLoadSuccess={onDocumentLoadSuccess}>*/}
            <Document
              file={pdfFilePath1}
              onLoadSuccess={(pdf) => { console.log('[PDF] load success pages=', pdf.numPages, 'file=', pdfFilePath1); onDocumentLoadSuccess(pdf); }}
              onLoadError={(err) => { console.error('[PDF] load error', pdfFilePath1, err); }}
              // Use rest args to satisfy react-pdf's OnSourceSuccess type (which can supply multiple params)
              onSourceSuccess={(...args) => { console.log('[PDF] source success', ...args); }}
              onSourceError={(err) => { console.error('[PDF] source error', err); }}
            >
              {/* Page Rendering */}
              {getPagePairs(renderedPages).map((pagePair, index) => {
                  // 确保 ref 存在
                  if (!containerRefs.current[`pair_${index}`]) {
                    containerRefs.current[`pair_${index}`] = React.createRef();
                  }

                  return (
                    <div
                      ref={containerRefs.current[`pair_${index}`]}
                      key={`pair_${index}`}
                      style={{
                        display: 'flex',
                        justifyContent: 'center',
                        gap: isTwoPageView ? '0px' : '10px',
                        marginBottom: '5px',
                        margin: '8px auto',
                        width: 'fit-content',
                        position: 'relative',
                      }}

                      onMouseDown={(e) => {

                        if(!e.ctrlKey) { 
                          setSelectionBox({ x: 0, y: 0, width: 0, height: 0, pairIndex: 0 });
                          return;
                        }else { 
                          //if(!isConnected){connnectRealtimeAPI();return;}
                          document.body.style.userSelect = 'none'; // Prevent text selection
                        }

                        //document.body.style.userSelect = 'none'; // Prevent text selection
                        //const rect = e.currentTarget.getBoundingClientRect();
                        selectionStart.current = { 
                          x: e.clientX, 
                          y: e.clientY 
                        };
                        setIsSelecting(true);
                        setSelectionBox({ 
                          x: e.clientX,
                          y: e.clientY,
                          width: 0, 
                          height: 0,
                          pairIndex: index 
                        });
                      }}

                      onMouseMove={(e) => {
                        if (!isSelecting) return;
                        
                        setSelectionBox(prev => ({
                          ...prev,
                          x: Math.min(e.clientX, selectionStart.current.x),
                          y: Math.min(e.clientY, selectionStart.current.y),
                          width: Math.abs(e.clientX - selectionStart.current.x),
                          height: Math.abs(e.clientY - selectionStart.current.y),
                        }));
                      }}

                      onMouseUp={(e) => {
                        setIsSelecting(false);
                        if(!e.ctrlKey) { 
                          return;
                        }else { 
                          document.body.style.userSelect = 'auto'; // Prevent text selection
                        }

                        //document.body.style.userSelect = 'auto'; // Restore text selection
                        if (selectionBox.width > 10 && selectionBox.height > 10) {
                          showScreenshotMenu(selectionBox);
                        }
                      }}
                    >
                      {pagePair.map((pageNumber) => (
                        <div
                          ref={pageRefs.current[pageNumber]}
                          key={`page_${pageNumber}`}
                          style={{
                            flexShrink: 0,
                            margin: 0,
                          }}
                        >
                          <Page
                            pageNumber={pageNumber}
                            renderTextLayer={true}
                            renderAnnotationLayer={true}
                            onLoadSuccess={() => onPageLoadSuccess({ pageNumber })}
                            loading={<p>Loading page {pageNumber}...</p>}
                            width={isTwoPageView ? 430 : 860}
                          />
                        </div>
                      ))}
                      {selectionBox.pairIndex === index && (
                        <SelectionOverlay 
                          box={selectionBox} 
                          containerRef={containerRefs.current[`pair_${index}`]}
                        />
                      )}
                  </div>);
              })}
            </Document>
          </div> 
        </div>

        {/* Splitter Area */}
        {/* Open(Left Arrow<-) or Close((Right Arrow->)) Right Panel */}
        <div className="button-container">
          <div id="openRightArrow" className="close-icon-right" onClick={openChatbot} style={{display: (isConnected? "flex": "flex")}}><ArrowLeft style={{ width: '18px', height: '18px' }} /></div>
          <div className="tooltip1"><span>Open Sidebar</span></div>
        </div>
        <div  id="closeRightArrow" className="close-icon-left" onClick={closeRightArrowNew} style={{display: "none"}}><ArrowRight style={{ width: '18px', height: '18px' }} /></div>
        {/* tooltip for the left button still does not work */}
        {/* <div id="closeRightArrow" className="button-container">
              <div  id="closeRightArrow" className="close-icon-left" onClick={closeRightArrowNew} style={{display: "none"}}><ArrowRight style={{ width: '15px', height: '15px' }} /></div>
              <div className="tooltip1"><span><strong className='tooltip-title'>Close Chatbot</strong></span>
              </div>
            </div> */}

        <div id="splitter" className="splitter" onMouseDown={handleSplitterMouseDown} style={{display: "none"}}></div>

        {/* Right Area: show the chatbot and conversation list on the right side panel */}
        <div className="content-right" ref={rightRef} style={{display: "none"}}>
          <div id="chatContainer" style={{display: "none"}}><Chat functionCallHandler={functionCallHandlerForChat} realtimeClient={clientRef.current} getIsMuted={getIsMuted} ref={chatRef} /></div>

          {/*content-main for test purpose*/}
          <div className="content-main" ref={conversationDivRef} style={{display: "none"}}>
            {/*Test: show the Realtime API conversations on the right side panel*/}
            <div className="content-logs"  style={{display: "none"}}>
              <div className="content-block conversation">
                {/*<div className="content-block-title">Conversation List</div>*/}
                <div className="content-block-body" data-conversation-content>
                  {/*{!items.length && `awaiting connection...`}*/}
                  {!items.length && `Conversation List`}
                  {items.map((conversationItem, i) => {
                    return (
                      <div className="conversation-item" key={conversationItem.id}>
                        <div className={`speaker ${conversationItem.role || ''}`}>
                          <div>
                            {(
                              conversationItem.role || conversationItem.type
                            ).replaceAll('_', ' ')}
                          </div>
                          <div
                            className="close"
                            onClick={() =>
                              deleteConversationItem(conversationItem.id)
                            }
                          >
                            <X />
                          </div>
                        </div>
                        <div className={`speaker-content`}>
                          {/* tool response */}
                          {conversationItem.type === 'function_call_output' && (
                            <div>{conversationItem.formatted.output}</div>
                          )}
                          {/* tool call */}
                          {!!conversationItem.formatted.tool && (
                            <div>
                              {conversationItem.formatted.tool.name}(
                              {conversationItem.formatted.tool.arguments})
                            </div>
                          )}
                          {!conversationItem.formatted.tool &&
                            conversationItem.role === 'user' && (
                              <div>
                                {conversationItem.formatted.transcript ||
                                  (conversationItem.formatted.audio?.length
                                    ? '(awaiting transcript)'
                                    : conversationItem.formatted.text ||
                                      '(item sent)')}
                              </div>
                            )}
                          {!conversationItem.formatted.tool &&
                            conversationItem.role === 'assistant' && (
                              <div>
                                {conversationItem.formatted.transcript ||
                                  conversationItem.formatted.text ||
                                  '(truncated)'}
                              </div>
                            )}
                          {conversationItem.formatted.file && (() => {
                              console.log("Audio URL:", conversationItem.formatted.file.url); 
                              //console.log("Audio:", conversationItem.status);
                              return (
                                <audio
                                  src={conversationItem.formatted.file.url}
                                  controls
                                />
                              );
                            })()
                          }
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom toolbar area to display different buttons, captions, progress bar, mute/unmute button */}
      <div id='button-row' className='button-row'>
        {/*Test: adjust the caption font size if it is visible */} 
        {/*Test: captionsize-container demos to show tool tip on the left of the page */} 
        <div className="captionsize-container" style={{display: 'none'}}>                  
          <div style={{pointerEvents: isCaptionVisible? 'auto' : 'none'}}>
              <div className="captionFont" style={{cursor:'pointer'}} onClick={() => {adjustCaptionFontSize(+0.1)}}>+</div>
              <div className="captionFont" style={{cursor:'pointer'}} onClick={() => {adjustCaptionFontSize(-0.1)}}>-</div>            
          </div>
          <div className="captionsize" style={{display: isCaptionVisible? 'none' : 'flex'}}>Show caption to adjust it's size</div>
        </div>
        {/* Add a div to display the current caption */}
        {isCaptionVisible && ( 
          <div id='captionDisplay' className="caption-display"
               dangerouslySetInnerHTML={{ __html: currentCaption }}
               style={{ fontSize: '2.95em', marginTop: '20px', width: `${captionWidth}%`, opacity: '1' }}
               onClick={() => { /*toggleAudio()*/ }}
          ></div> )
        } 

        {/* Show/Hide Captions Button */}
        <div className="content-caption" style={{userSelect: 'none'}}>
          <Button
                  label={isCaptionVisible ? 'Hide Caption' : 'Show Caption'}
                  buttonStyle={'regular'}
                  iconPosition={'start'}
                  icon={AlignCenter}                  
                  onClick={toggleCaptionVisibility}
                  disabled={!isScriptExisting}
                  className='button'
          />                      
        </div>

        {/* Play/Pause Button */}
        {/* This hidden button is to receive space bar down event to play/pause the audio */}
        <button ref={playPauseBtnRef} onClick={toggleAudio} className='hidden-button'></button>
        <div className="tooltip-container" style={{userSelect: 'none'}}>
          <Button
                  label={isPlaying ? 'Pause' : 'Play\u00A0'}
                  iconPosition={'start'}
                  icon={isPlaying ? Pause : Play}
                  buttonStyle={'regular'}
                  onClick={toggleAudio}
                  disabled={!isAudioExisting}
                  className='button'
          />
          <div className="tooltip"  style={{display: isCaptionVisible? 'none' : 'flex'}}>
            <span>Press Space(空格键) to <> {isPlaying ? 'Pause' : 'Play'} </> the on-going Audio</span><br />
          </div>             
        </div>

        {/* Progress bar area */}
        <div 
          ref={progressBarRef}
          style={{position: 'relative', width: '55%', backgroundColor: '#ccc', height: '0.625em', borderRadius: '0.3125em', marginTop: '0.2em', marginLeft: '-1px', userSelect: 'none' }}
          onMouseDown={isAudioExisting ? handleMouseDown : undefined}>
          <div style={{ 
                        width: `${progress}%`,
                        backgroundColor: '#007bff',
                        height: '0.625em',
                        borderRadius: '0.3125em'
                       }}
          />
          {/* Three Speed control Options at the left-down of progress area */}
          <div className="speed-controls" onMouseDown={(e) => {
                                                                e.stopPropagation(); // Prevent event from reaching the progress bar
                                                              }}>         
            <div></div>                   
            {/* Three Speed control Options: Slower/Normal/Faster */}                                           
            <TrendingUp style={{ width: '17px', height: '17px' }} />                                                      
            <div className="speed-control" style={{ 
              backgroundColor: playbackRate === 0.85 ? '#666' : '#ccc', // Darker if active
              color: playbackRate === 0.85 ? '#fff' : '#000', // Adjust text color for contrast
              borderRadius: '0.3125em',
            }}  onClick={(e) => handleSpeedControlClick(e, 0.85)}>Slower</div>
            <div className="speed-control"         style={{
              backgroundColor: playbackRate === 1.0 ? '#666' : '#ccc', // Darker if active
              color: playbackRate === 1.0 ? '#fff' : '#000', // Adjust text color for contrast
              borderRadius: '0.3125em',
            }}    onClick={(e) => handleSpeedControlClick(e, 1.0)}>Normal</div>
            <div className="speed-control"         style={{
              backgroundColor: playbackRate === 1.2 ? '#666' : '#ccc', // Darker if active
              color: playbackRate === 1.2 ? '#fff' : '#000', // Adjust text color for contrast
              borderRadius: '0.3125em',
            }}    onClick={(e) => handleSpeedControlClick(e, 1.2)}>Faster</div>  
            {/* Loop button to loop the current audio 
            <div></div> 
            <div className="speed-control"         style={{
              display: 'none',
              backgroundColor: isLoop === true ? '#666' : '#ccc', // Darker if active
              color: isLoop === true ? '#fff' : '#000', // Adjust text color for contrast
              borderRadius: '0.3125em',
            }}    onClick={(e) => handleLoopClick(e)}>Loop</div>    */}     
                                       
            <div><span className="separator">|</span></div>

            {/* Three Volume control Options: Lower/Normal/Louder */} 
            <Volume style={{ width: '17px', height: '17px' }} />
            <div className="speed-control" style={{ 
              backgroundColor: playbackVolume === 0.50 ? '#666' : '#ccc', // Darker if active
              color: playbackVolume === 0.50 ? '#fff' : '#000', // Adjust text color for contrast
              borderRadius: '0.3125em',
            }}  onClick={(e) => handleVolumeControlClick(e, 0.50)}>Lower</div>
            <div className="speed-control"         style={{
              backgroundColor: playbackVolume === 0.75 ? '#666' : '#ccc', // Darker if active
              color: playbackVolume === 0.75 ? '#fff' : '#000', // Adjust text color for contrast
              borderRadius: '0.3125em',
            }}    onClick={(e) => handleVolumeControlClick(e, 0.75)}>Normal</div>
            <div className="speed-control"         style={{
              backgroundColor: playbackVolume === 1.0 ? '#666' : '#ccc', // Darker if active
              color: playbackVolume === 1.0 ? '#fff' : '#000', // Adjust text color for contrast
              borderRadius: '0.3125em',
            }}    onClick={(e) => handleVolumeControlClick(e, 1.0)}>Louder</div>   
            <div><span className="separator">|</span></div>
            <div title='Show Flashcards'><Layers color='blue' style={{ width: '17px', height: '17px' }} onClick={toggleFlashcards} /></div>
            {/* Quiz featue is not ready yet
            <div><span className="separator">|</span></div>            
            <div title='Have a Quiz'><HelpCircle color='red' style={{ width: '17px', height: '17px' }} /></div>            
            */}
            <div><span className="separator" style={{userSelect: 'none', display: hasKeywords ? 'flex' : 'none' }}>|</span></div>
            <div className="tooltip-container" style={{userSelect: 'none', display: hasKeywords ? 'flex' : 'none' }}>
              <div title={keyword === '' ? 'Select a Keyword to Dive in' : '' }><BookOpen color='blue' style={{ width: '17px', height: '17px' }} /></div>
              <div className="tooltip" style={{backgroundColor: 'rgb(255, 255, 255, 1)', width: 'auto', height: 'auto'}}>
                <ul style={{listStyle: 'none', marginLeft:'10px', textAlign: 'left', padding: '0px'}}> 
                  {Object.entries(Keywords.current as Record<string, [number, number, number]>).map(([key, [value1, value2, value3]], index) => value3 !== 0 && (
                    <li
                      key={index} // Use index as the key for React
                      className={`hover-effect ${keyword === key ? 'active' : ''}`}
                      style={{
                        borderRadius: '0.3125em',
                        whiteSpace: 'nowrap',
                        textAlign: 'left',
                        fontSize: '1.5em',
                        cursor: 'pointer',
                        marginRight: '20px',
                        marginLeft: '10px',
                      }}
                      onClick={(e) => loopKeywordPlay(e, key, value1, value2, value3)} // Loop play the keyword segment
                    >
                      {index+1}.{key}
                    </li>
                  ))}
                </ul>
              </div> 
            </div>
            <div className="speed-control"         style={{
              display: keyword === '' ? 'none' : 'flex',
              backgroundColor: keyword !== '' ? '#666' : '#ccc', // Darker if active
              color: keyword !== '' ? '#fff' : '#000', // Adjust text color for contrast
              borderRadius: '0.3125em',
            }}    onClick={(e) => handleClearKeyword(e)} title='Clear Keyword Play Looping'>{keyword === '' ? 'Select a Keyword to Dive in' : keyword }</div> 
            {/* Test: Place the search box for video at the right-down of progress bar area */}  
            <div style={{position: 'fixed', transform:'translateX(41.5em)', bottom: '1px'}}>
              <input id="searchBox" 
                    type="text"                      
                    className='dynamic-searchBox' 
                    placeholder="Type and Press Enter to Search a Video" 
                    style={{display:"none"}}
                    onFocus={() => { const searchBox = document.getElementById('searchBox');                                        
                                      (searchBox as HTMLInputElement).value = ''; 
                                      (searchBox as HTMLInputElement).style.color = 'blue'; 
                                    }} 
              /> 
            </div>  
          </div>

          {/* Display the current play time and Total time */}
          <div
            style={{
              position: 'absolute',
              top: '-2em', // Adjust as needed
              left: `${progress}%`, // Move with the progress bar
              transform: 'translateX(-20%)', // Center the text
              backgroundColor: 'rgba(255, 255, 255, 0)',
              color: 'rgba(0, 0, 0, 0.7)',
              padding: '0.3125em',
              borderRadius: '0.3125em',
              fontSize: '0.9em',
            }}>
            {formatDuration({time: currentTime})}
          </div>                    
          {/* total duration */}
          <div className="audio-duration">
            {formatDuration({time: totalDuration})}
          </div>          
        </div>  

        {/* Mute/Unmute Button to have a real time conversion */}                      
        <button id="muteButtonRef" ref={muteBtnRef} onClick={toggleMuteRecording} className='hidden-button'></button>  
        <div className="tooltip-container">
          <Button
              id="muteButton"
              label={isMuted ? '' : ''}
              iconPosition={'start'}
              icon={!isConnected? Zap : isMuted ? MicOff : Mic}
              //icon={!isConnected? Zap : !isCloseRightPanelDisabled ? X : isMuted ? MicOff : Mic}
              //disabled={ (isConnected&&!isCloseRightPanelDisabled) ? true: false}
              //disabled={isMuteBtnDisabled}
              //disabled={!isConnected}
              buttonStyle={'regular'}
              onClick={toggleMuteRecording}
              //className='hidden-button'
            />
          <div className="tooltip"  style={{display: isCaptionVisible && 'none'}}>
            <strong className='tooltip-title'>Turn <>{isMuted ? 'on' : 'off'}</> microphone</strong><br />
            {!isConnected && <> <span className="highlightred">Conntect First!</span> to have a real time conversation during playback on-going.<br /><br /> </>}
            {isConnected && <><br /> </>}
          </div>            
        </div>   
        {/*Display Copilot Status*/}      
        <div style={{ fontSize: '1em', userSelect: 'none', marginLeft: '5px' }}>{isConnected ? ( <> Copilot: <span className="highlightgreen">On</span> </> ) : (isMuteBtnDisabled ? startingText : (isConnectionError ? ( <><span className="highlightred">Error Occurred!</span></> ) : ( <> Copilot: <span className="highlightred">Off</span> </> )) )}</div>      

        {/*<Zap onClick={ isConnected ? disConnnectRealtimeAPI : connnectRealtimeAPI } style={{ display: isConnected ? "none" : "flex", marginRight: "1px", marginLeft: "auto", justifyContent: "flex-end", zIndex: '9999', userSelect: 'none', cursor: "pointer" }}/>      */}
        {/*Settings for AI assistant and Realtime API*/} 
        {/*<div style={{display:"flex", marginRight: "0px", marginLeft: isConnected ? "auto" : "1px", justifyContent: "flex-end", zIndex: '9999', userSelect: 'none' }}>            */} 
        <div style={{display:"flex", marginRight: "0px", marginLeft: "auto", justifyContent: "flex-end", zIndex: '9999', userSelect: 'none' }}>            
          <div title='Realtime Session Countdown' style={{ fontSize: '1em', userSelect: 'none', marginRight: '7px' }}><><CountdownTimer startTime={30} /> </></div>      
          <div></div>
          <div className="setting-container" style={{display: "flex"}}>
            <Settings style={{ width: '20px', height: '20px',marginLeft: '1px', marginRight: '1px' }}/>
            <div className="setting">
              <strong className='setting-title'>Setting</strong><br /><br />
              {/*Settings for Voice selection of Realtime API*/} 
              <div className="speed-controls" style={{pointerEvents: isConnected? 'none' : 'auto'}} onMouseDown={(e) => {
                                                              e.stopPropagation(); // Prevent event from reaching the progress bar
                                                            }}>
                <div title='Select a voice to chat'><User style={{ width: '13px', height: '13px' }} />:</div>                                               
                <div className="speed-control"         style={{
                  backgroundColor: rtVoice === 'alloy' ? '#666' : '#ccc', // Darker if active
                  color: rtVoice === 'alloy' ? '#fff' : '#000', // Adjust text color for contrast
                  borderRadius: '0.3125em',
                }}    onClick={(e) => handleVoiceControlClick(e, 'alloy')}>alloy</div>                
                <div className="speed-control" style={{ 
                  backgroundColor: rtVoice === 'ash' ? '#666' : '#ccc', // Darker if active
                  color: rtVoice === 'ash' ? '#fff' : '#000', // Adjust text color for contrast
                  borderRadius: '0.3125em',
                }}  onClick={(e) => handleVoiceControlClick(e, 'ash')}>ash</div>
                <div className="speed-control"         style={{
                  backgroundColor: rtVoice === 'sage' ? '#666' : '#ccc', // Darker if active
                  color: rtVoice === 'sage' ? '#fff' : '#000', // Adjust text color for contrast
                  borderRadius: '0.3125em',
                }}    onClick={(e) => handleVoiceControlClick(e, 'sage')}>sage</div>  
                <div className="speed-control"         style={{
                  backgroundColor: rtVoice === 'coral' ? '#666' : '#ccc', // Darker if active
                  color: rtVoice === 'coral' ? '#fff' : '#000', // Adjust text color for contrast
                  borderRadius: '0.3125em',
                }}    onClick={(e) => handleVoiceControlClick(e, 'coral')}>coral</div> 
                <div className="speed-control"         style={{
                  backgroundColor: rtVoice === 'shimmer' ? '#666' : '#ccc', // Darker if active
                  color: rtVoice === 'shimmer' ? '#fff' : '#000', // Adjust text color for contrast
                  borderRadius: '0.3125em',
                }}    onClick={(e) => handleVoiceControlClick(e, 'shimmer')}>shimmer</div>  
                <div className="speed-control"         style={{
                  backgroundColor: rtVoice === 'echo' ? '#666' : '#ccc', // Darker if active
                  color: rtVoice === 'echo' ? '#fff' : '#000', // Adjust text color for contrast
                  borderRadius: '0.3125em',
                }}    onClick={(e) => handleVoiceControlClick(e, 'echo')}>echo</div>                                 
              </div>  
              {/*Assistant ID regeneration*/} 
              <div className="speed-controls">
                <div title='Regenerate Assistant ID'><UserPlus style={{ width: '13px', height: '13px' }} />:</div>
                <div>{localStorage.getItem('tmp::asst_id')?.slice(0, 5) ?? ''}...</div> 
              </div>               
              {/*API Key Reset*/}     
              <div className="speed-controls">
                <div title='Reset API Key'><Edit style={{ width: '13px', height: '13px' }} onClick={() => resetAPIKey()} />:</div>
                <div>{localStorage.getItem('tmp::voice_api_key')?.slice(0, 5) ?? ''}...</div>               
              </div> 
              <div className="speed-controls">
                <div title='Chat Models'><Edit2 style={{ width: '13px', height: '13px' }} />:</div>
                <select id="Model" name="Model" onChange={handleModelChange} style={{height: '20px', width:'90%'}}>                                 
                  <option key={1} value={'GPT-Realtime'}>
                      {'GPT-Realtime - Most Capable'}
                  </option>   
                  <option key={2} value={'GPT-Realtime-Mini'}>
                      {'GPT-Realtime-Mini - Cheapest'}
                  </option>                                                   
                  <option key={3} value={'GPT-4o'}>
                      {'GPT-4o'}
                  </option>
                  <option key={4} value={'DeepSeek'}>
                      {'DeepSeek'}
                  </option>                  
                </select>                          
              </div>               
              <div className="speed-controls">
                <div title='Select a new issue'><Book style={{ width: '13px', height: '13px' }} />:</div>
                <select id="Magzine" name="Magzine" onChange={handleSelectChange} style={{height: '20px', width:'90%'}}>            
                  {magzines.map((magazine, index) => (
                          <option key={index} value={magazine}>
                              {magazine}
                          </option>
                      ))}
                </select>                            
              </div>                                                                                             
            </div>                         
          </div>   
        </div>       
      </div>   

    </div>
  );
}