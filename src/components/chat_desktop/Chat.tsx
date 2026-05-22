import React, {forwardRef, useImperativeHandle, useState, useEffect, useRef, useLayoutEffect } from "react";
import styles from "./Chat.module.css";
import Markdown from "react-markdown";
import rehypeRaw from "rehype-raw"; // required to render raw HTML - render iframe in chat
import { AssistantStream } from "openai/lib/AssistantStream";
import { OpenAI } from "openai";
import { AssistantStreamEvent } from "openai/resources/beta";
import { RequiredActionFunctionToolCall } from "openai/resources/beta/threads/runs/runs";
import { RealtimeClient, type ItemType } from '../../lib/realtime/index.js';

import { Button } from '../button/Button';
import { Mic, MicOff, Send, Trash2 } from 'react-feather';

import { detectDevice } from '../../utils/detectDevice';
import { useChatHistory } from '../../hooks/useChatHistory';


let apiKey = localStorage.getItem('tmp::voice_api_key');
if (apiKey === '') {
  apiKey = prompt('OpenAI API Key');
  if (apiKey === null) {
    throw new Error('API Key is required');
  } else {  
    localStorage.setItem('tmp::voice_api_key', apiKey);
  }  
}

//tbd: assistant creation when the existing assistant is not available
//const assistantId = ""; // indicate the new assistant to not alter or transform HTML content when including <iframe>
let assistantId = localStorage.getItem('tmp::asst_id');
if (assistantId === null) {
  assistantId = prompt('Assistant Id needed');
  if (assistantId === null) {
    throw new Error('Assistant Id is required');
  } else {  
    localStorage.setItem('tmp::asst_id', assistantId);
  }  
}

export const openai = new OpenAI({
  apiKey: apiKey, 
  dangerouslyAllowBrowser: true // Set this option to allow usage in a browser environment
});

type MessageProps = {
  role: "user" | "assistant" | "code" | "audio" | "read_aloud";
  text: string;
  items: ItemType[];
};

const UserMessage = ({ text }: { text: string }) => {

  const preprocessText = (text: string) => {

    if (text.includes('Read Aloud:') || text.includes('Translate:') || text.includes('wordcard:') || text.includes('SyntaxAnalyze:')) {
      //return 'Describe Selection';
      return '';
    }  
    return text;    
  }; 

  //If screenshot image URL passed in, show the image directly by <img> tag
  const messageType = text.includes('data:image/png;base64,') ? 'image' : 'text'; 

  switch (messageType) {
    case "text":
      if(!text.includes('Read Aloud:') && !text.includes('Translate:') && !text.includes('wordcard:') ){
        return <div className={styles.userMessage}>
                <Markdown rehypePlugins={[rehypeRaw]}
                >{preprocessText(text)}</Markdown>
              </div>
      }else{return null;}
    case "image":
      return <div className={styles.userMessage}>
              <img src={text} alt="Captured Element"               
                   //onDoubleClick={() => handleImgDoubleClick(text)}
                   style={{
                      //cursor: "pointer",
                      border: "1px solid #ccc",
                   }} />
             </div>
    default:
      return null;
  }   
};

const StructPrompt = ({ prompt }: { prompt: string }) => {
  const sentences = prompt.split('.').filter(sentence => sentence.trim() !== '');

  return  (
      <ul>
        {sentences.map((sentence, index) => (
          <li key={index}>
            {sentence.trim()+'.'}
          </li>
        ))}
      </ul>);
};

const AssistantMessage = ({ text }: { text: string }) => {
  const [showPrompt, setShowPrompt] = useState(false);
  const preprocessText = (text: string) => {
    if (!text.includes('<iframe') && !text.includes('</iframe>')) {
      return text.replace(/\n/g, '<br />');
    }
    return text;
  };  

  const handleImgDoubleClick = (src: string) => {
    const popupOverlay = document.getElementById('popupOverlay');
    const imageFrame = document.getElementById('imageFrame');
    const videoFrame = document.getElementById('videoFrame');
    const popupContent = document.getElementById('popupContent');    

    (imageFrame as HTMLImageElement).src = src;
    (popupContent as HTMLIFrameElement).className = 'popup-content-video';
    if (popupOverlay){
      popupOverlay.style.display = 'flex';
      (imageFrame as HTMLImageElement).style.display = 'flex';
      (imageFrame as HTMLImageElement).style.width = '670px';
      (imageFrame as HTMLImageElement).style.height = '670px';
      (videoFrame as HTMLIFrameElement).style.display = 'none';
    }
  }

  return (  
    <div className={styles.assistantMessage}>
	    <Markdown rehypePlugins={[rehypeRaw]}         
                components={{
                              img: ({ src, alt, title }) => (
                                <>
                                  <div style={{position: "relative", display: "inline-block"}}>
                                    <img
                                      src={src}
                                      alt={alt}
                                      onDoubleClick={() => handleImgDoubleClick(src)}
                                      style={{
                                        cursor: "pointer",
                                        border: "1px solid #ccc",
                                      }}
                                    />                                              
                                    <div onClick={() => {setShowPrompt(!showPrompt);}} style={{userSelect: "none", position: "absolute", bottom: "5px", right: "0px",backgroundColor: showPrompt ? "gray" : "lightgray", width: '100px', height:"20px", borderRadius: '4px', cursor:'pointer',textAlign: "center"}}>
                                      {showPrompt ? "Hide Prompt" : "Show Prompt"}                    
                                    </div>
                                  </div>
                                  <div style={{display: showPrompt ? 'flex' : 'none', border: "1px solid #ccc", borderRadius: '4px', padding: '5px', marginTop: '5px', backgroundColor: 'lightgray'}}>
                                    <StructPrompt prompt={title} />
                                  </div>
                                </>
                              ),
        }}>{preprocessText(text)}</Markdown>
    </div>    
  );
};

const ReadAloudMessage = ({ text }: { text: string }) => {
  return (  
    <div className={styles.assistantMessage}>
      <audio src={text} controls />
    </div>
  );
};

//const OriginalAudio = ({ align, itemId, items }: { align: string; itemId: string; items: RealtimeClientItemType[] }) => {
const OriginalAudio = ({ align, itemId, items }: { align: string; itemId: string; items: ItemType[] }) => {
  return (
    <div style={{ alignSelf: align }} >
      {items
        .filter((conversationItem) => conversationItem.id === itemId) // Filter for the specific item
        .map((conversationItem) => (          
          <div key={conversationItem.id}>                       
              {conversationItem.formatted.file && (() => {
                return (
                  <audio src={conversationItem.formatted.file.url} controls />
                );
              })()}               
          </div>
      ))}
    </div>  
  );
};

const AudioMessage = ({ itemId, items }: { itemId: string; items: ItemType[] }) => {
  const tempItem = items.find((conversationItem) => conversationItem.id === itemId);

  // Check if tempItem exists before accessing its properties
  if (!tempItem) {
    return null;  // Item not found, skip rendering
  }

  const role = tempItem.role;
  const alignSelf = role === 'user' ? 'flex-end' : 'flex-start';

  // Get display text - prefer transcript, then text, then fallback
  const getDisplayText = () => {
    if (tempItem.formatted?.transcript) return tempItem.formatted.transcript;
    if (tempItem.formatted?.text) return tempItem.formatted.text;
    if (tempItem.formatted?.audio?.length) return '(awaiting transcript)';
    return '(audio message)';
  };

  switch (role) {
    case "user":
      return <> {/*Transcription for user audio or text only*/}
                <UserMessage text={getDisplayText()} />
                <OriginalAudio align={alignSelf} itemId={itemId} items={items} />
             </>
    case "assistant":
      return <> {/*Transcription for system response audio*/}
                <AssistantMessage text={getDisplayText()} />
                <OriginalAudio align={alignSelf} itemId={itemId} items={items} />
            </>
    default:
      return null;
  }

};

const CodeMessage = ({ text }: { text: string }) => {
  return (
    <div className={styles.codeMessage}>
      {text.split("\n").map((line, index) => (
        <div key={index}>
          <span>{`${index + 1}. `}</span>
          {line}
        </div>
      ))}
    </div>
  );
};

const Message = ({ role, text, items }: MessageProps) => {
  switch (role) {
    case "user":
      return <UserMessage text={text} />;
    case "assistant":
      return <AssistantMessage text={text} />;
    case "code":
      return <CodeMessage text={text} />;
    case "audio":
      return <AudioMessage itemId={text} items={items} />;      
    case "read_aloud":
      return <ReadAloudMessage text={text} />;
    default:
      return null;
  }
};

type ChatProps = {
  functionCallHandler?: (
    toolCall: RequiredActionFunctionToolCall
  ) => Promise<string>;
  realtimeClient?: RealtimeClient;
  getIsMuted?: () => boolean;
  magazine?: string;  // For chat history persistence
};

const Chat = forwardRef(({ functionCallHandler = () => Promise.resolve(""), getIsMuted, realtimeClient, magazine }: ChatProps, ref) => {
  const [userInput, setUserInput] = useState("");
  //new codes by copilot
  const [messages, setMessages] = useState<{ role: "user" | "assistant" | "code" | "audio" | "read_aloud"; text: string }[]>([]);
  const [inputDisabled, setInputDisabled] = useState(false);
  const [threadId, setThreadId] = useState("");
  const threadIdRef = useRef<string | null>(null);
  const [items, setItems] = useState<ItemType[]>([]);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const [chatModel, setChatModel] = useState("GPT-Realtime");
  const [isChecked, setIsChecked] = useState(true);

  const [deviceType, setDeviceType] = useState<ReturnType<typeof detectDevice>>(detectDevice());

  const inputFormRef = useRef<HTMLFormElement | null>(null);
  const [inputFormHeight, setInputFormHeight] = useState(45); // Track input form height for clear button position

  // Track input form height changes
  useLayoutEffect(() => {
    const form = inputFormRef.current;
    if (!form) return;
    const updateHeight = () => {
      const height = form.offsetHeight;
      if (height !== inputFormHeight) setInputFormHeight(height);
    };
    updateHeight();
    const observer = new ResizeObserver(updateHeight);
    observer.observe(form);
    return () => observer.disconnect();
  }, [inputFormHeight]);

  // Chat history persistence
  const {
    sessionId,
    isLoading: isHistoryLoading,
    savedMessages,
    savedItems,
    saveMessage: persistMessage,
    saveItem: persistItem,
    clearHistory
  } = useChatHistory({ magazine: magazine || 'default' });

  // Track previous magazine to detect changes
  const prevMagazineRef = useRef(magazine);

  // Load saved history when magazine changes or history finishes loading
  useEffect(() => {
    // Check if magazine changed
    if (prevMagazineRef.current !== magazine) {
      prevMagazineRef.current = magazine;
      // Clear current state when magazine changes - new data will load via the hook
      setMessages([]);
      setItems([]);
      return;
    }

    // Load history when not loading and we have data
    if (!isHistoryLoading && (savedMessages.length > 0 || savedItems.length > 0)) {
      setMessages(savedMessages.map(m => ({
        role: m.role as "user" | "assistant" | "code" | "audio" | "read_aloud",
        text: m.text
      })));
      setItems(savedItems);
    }
  }, [isHistoryLoading, savedMessages, savedItems, magazine]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  // Use useImperativeHandle to define functions that the parent can call
  useImperativeHandle(ref, () => ({
    updateChatModel(chatModel) {
      setChatModel(chatModel);
    }, 
    updateData(audioData) {
      appendMessage("user", audioData);
    },
    updateVideo(embedUrl) {
      appendMessage("assistant", embedUrl);
    }, 
    updateGenImage(imgUrl) {
      appendMessage("assistant", imgUrl);
    },      
    updateScreenshot(imgUrl) {
      appendMessage("user", imgUrl);
    },     
    updateSelection(selection) {
      //appendMessage("user", `<div style={fontSize: '0.2em',}>[Read Aloud]:</div><br />`+ selection);
      appendMessage("user", '[Read Aloud]:<br />'+ selection);
    },          
    updateImgAnalyzeResponse() {
      //appendMessage("user", `<div style={fontSize: '0.2em',}>[Read Aloud]:</div><br />`+ selection);
      appendMessage("assistant", 'Begin to analyze...');
    },    
    updateReadAloud(audio_url) {
      appendMessage("read_aloud", audio_url);
    },        

    updateItems(newItems) {

      setItems((prevItems) => {
        // Create a Set of IDs for quick lookup of existing items
        const existingIds = new Set(prevItems.map((item) => item.id));

        // Filter newItems to include only those that are not already in the state
        const filteredNewItems = newItems.filter((item) => !existingIds.has(item.id));

        // Return the updated state by appending the filtered new items
        return [...prevItems, ...filteredNewItems];
      });

      // Persist items to database - save all items that have transcript, completed status, or audio
      // This handles both new items and updates to existing items with transcripts
      newItems.forEach((item) => {
        const hasTranscript = item.formatted?.transcript && item.formatted.transcript.length > 0;
        const hasText = item.formatted?.text && item.formatted.text.length > 0;
        const isCompleted = (item as any).status === 'completed';
        const hasAudio = item.formatted?.audio && item.formatted.audio.length > 0;
        const hasFile = !!item.formatted?.file?.url;

        // Debug logging
        console.log('[Chat] updateItems checking item:', {
          id: item.id,
          role: item.role,
          status: (item as any).status,
          hasTranscript,
          hasText,
          hasAudio,
          hasFile
        });

        // Save if item has content worth saving
        // For audio items, only save when completed AND have file URL (so audio can be played back)
        // This ensures the WAV file has been created from the audio data before saving
        const shouldSaveAudio = hasAudio && hasFile && isCompleted;
        const shouldSaveText = hasTranscript || hasText;

        if (shouldSaveText || shouldSaveAudio) {
          persistItem(item);
        }
      });
    },

    updateItemID(updateItemID) {
      appendMessage("audio", updateItemID);
    },

    // Clear chat history
    clearChatHistory: async () => {
      await clearHistory();
      setMessages([]);
      setItems([]);
    },

    explainSelection(userInput) {     
      sendMessage(userInput);
      setInputDisabled(true);
    },    

    chatFromExternal(userInput) {
      if (!userInput.trim()) return;
      
      const checkBox = document.getElementById('checkBox') as HTMLInputElement;
      //if(isChecked) {
      if(checkBox.checked) {
      // use Realtime API to reply user input/question
        //appendMessage("user", userInput);
        if(realtimeClient.isConnected()){
          realtimeClient.sendUserMessageContent([
            {
              type: `input_text`,
              text: userInput,
            },
          ]);
        }else{
          appendMessage("assistant", "RealTime API Connection error. Please Connect again...");
          setInputDisabled(false);
        }
      }else{
      // use Assistant API to reply user input/question
        setMessages((prev) => [...prev, { role: "user", text: userInput }]);
        sendMessage(userInput);
        //setUserInput("");
        setInputDisabled(true);
      }
      setUserInput("");
    },

  }));  

  useEffect(() => {
    scrollToBottom();
  }, [messages, items]);

  const getThreadId = async () => {
    /*
    const res = await fetch(`/api/assistants/threads`, {
      method: "POST",
    });
    const data = await res.json(); */
    try{
      if (!threadId) {
        const thread = await openai.beta.threads.create();
        setThreadId(thread.id);
        threadIdRef.current = thread.id;
      }
    } catch (error) {
      appendMessage("assistant", "Connection error. Please try again.");
      setInputDisabled(false);
    }
  };  

  const sendMessage = async (text: string) => {
    /*
    const response = await fetch(`/api/assistants/threads/${threadId}/messages`, {
      method: "POST",
      body: JSON.stringify({
        content: text,
      }),
    });*/

    try {
          await getThreadId(); 
          await openai.beta.threads.messages.create(threadIdRef.current, {
            role: "user",
            content: text,
          });
      
          const stream = openai.beta.threads.runs.stream(threadIdRef.current, {
            assistant_id: assistantId,
          });    
  
          //changed by copilot
          const readableStream = stream.toReadableStream();
          if (readableStream) {
            const assistantStream = AssistantStream.fromReadableStream(readableStream);
            handleReadableStream(assistantStream);
          } else {
            console.error("Response body is null");
          }
      } catch (error) {
        console.error("Error sending message", error);
        appendMessage("assistant", "Connection error. Please try again...");
        setInputDisabled(false);
      }
  };

  const submitActionResult = async (runId, toolCallOutputs) => {
    /*
    const response = await fetch(
      `/api/assistants/threads/${threadId}/actions`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          runId: runId,
          toolCallOutputs: toolCallOutputs,
        }),
      }
    );*/

    // Cast to any because current OpenAI type definitions expose the third param as RequestOptions and
    // do not yet include the body { tool_outputs }, but the runtime supports it.
    const submitStream = (openai.beta.threads.runs as any).submitToolOutputsStream(
      threadIdRef.current,
      runId,
      { tool_outputs: toolCallOutputs }
    );    

    const assistantStream = AssistantStream.fromReadableStream(submitStream.toReadableStream());
    handleReadableStream(assistantStream);
  };  

  // handleRequiresAction - handle function call
  const handleRequiresAction = async (
    event: AssistantStreamEvent.ThreadRunRequiresAction
  ) => {
    const runId = event.data.id;
    const toolCalls = event.data.required_action.submit_tool_outputs.tool_calls;
    // loop over tool calls and call function handler
    const toolCallOutputs = await Promise.all(
      toolCalls.map(async (toolCall) => {
        const result = await functionCallHandler(toolCall);
        return { output: result, tool_call_id: toolCall.id };
      })
    );
    setInputDisabled(true);
    submitActionResult(runId, toolCallOutputs);
  };  

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userInput.trim()) {
      const muteButton = document.getElementById('muteButton');
      if (muteButton) {
        muteButton.click();
      }
      return;
    }

    switch (chatModel) {
      case "GPT-Realtime":
      case "GPT-Realtime-Mini":
        if(realtimeClient.isConnected()){
          realtimeClient.sendUserMessageContent([
            {
              type: `input_text`,
              text: userInput,
            },
          ]);
        }else{
          appendMessage("assistant", "RealTime API Connection error. Please Connect again...");
          setInputDisabled(false);
        }
        break;

      case "GPT-4o":
        setMessages((prev) => [...prev, { role: "user", text: userInput }]);
        sendMessage(userInput);
        setInputDisabled(true);
        break;

      case "DeepSeek":
        setMessages((prev) => [...prev, { role: "user", text: userInput }]);
        setUserInput("");
        console.log('DeepSpeek model');
        const query = userInput;
  const response: Response = await fetch(`/api/deepseek/chat/stream?q=${encodeURIComponent(query)}`);
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }        

        // reply with streaming model
        appendMessage("assistant", "");
        const reader = response.body.getReader();
        const decoder = new TextDecoder("utf-8");        
        let wholeText = '';
        while (true) {
          const { done, value } = await reader.read();
          if (done) {
            /*
            appendToLastMessage('\n');
            appendToLastMessage(`<button click='Prompt('Hi There')'>Read Aloud</button>`);    
            appendToLastMessage('\n');
            appendToLastMessage(`<div><Play style={{ width: '13px', height: '13px' }} /></div>`);
            if(wholeText){          
              realtimeClient.sendUserMessageContent([
                {
                  type: `input_text`,
                  text: `Read Aloud: ${wholeText} with slow speed and with clear and encourage tone. only output the read aloud content and donot output the transcript`,
                },
              ]); 
            }*/              
            break;
          }
    
          const text = decoder.decode(value);
          wholeText += text;
          appendToLastMessage(text);
        }          

        /* Previous logic without streaming        
        const resp: any = await response.json();
        appendMessage("assistant", resp);*/

        break;

      default:
        return null;
    }      

    setUserInput("");
  };

  /* Stream Event Handlers */

  // textCreated - create new assistant message
  const handleTextCreated = () => {
    appendMessage("assistant", "");
  };
;

  // textDelta - append text to last assistant message
  const handleTextDelta = (delta) => {
    if (delta.value != null) {
      appendToLastMessage(delta.value);
    };
    if (delta.annotations != null) {
      annotateLastMessage(delta.annotations);
    }
  };

  // imageFileDone - show image in chat
  interface ImageFileDoneEvent {
    file_id: string;
  }

  const handleImageFileDone = (image: ImageFileDoneEvent) => {
    appendToLastMessage(`\n![${image.file_id}](/api/files/${image.file_id})\n`);
  };

  // toolCallCreated - log new tool call
  interface ToolCall {
    type: string;
  }

  const toolCallCreated = (toolCall: ToolCall) => {
    if (toolCall.type != "code_interpreter") return;
    appendMessage("code", "");
  };

  // toolCallDelta - log delta and snapshot for the tool call
  interface ToolCallDelta {
    type: string;
    code_interpreter?: {
      input?: string;
    };
  }

  interface Snapshot {
    // Define the properties of the snapshot if needed
  }

  const toolCallDelta = (delta: ToolCallDelta, snapshot: Snapshot) => {
    if (delta.type != "code_interpreter") return;
    if (!delta.code_interpreter?.input) return;
    appendToLastMessage(delta.code_interpreter.input);
  };

  // handleRunCompleted - re-enable the input form
  const handleRunCompleted = () => {
    setInputDisabled(false);
  };  

  const handleReadableStream = (stream: AssistantStream) => {
    // messages
    stream.on("textCreated", handleTextCreated);
    stream.on("textDelta", handleTextDelta);

    // image
    stream.on("imageFileDone", handleImageFileDone);

    // code interpreter
    stream.on("toolCallCreated", toolCallCreated);
    stream.on("toolCallDelta", toolCallDelta);

    // events without helpers yet (e.g. requires_action and run.done)
    stream.on("event", (event) => {
      if (event.event === "thread.run.requires_action")
        handleRequiresAction(event);
      if (event.event === "thread.run.completed") handleRunCompleted();
    });
  };

  const appendToLastMessage = (text: string) => {
    setMessages((prev) => {
      const lastMessage = prev[prev.length - 1];
      const updatedLastMessage = { ...lastMessage, text: lastMessage.text + text };
      return [...prev.slice(0, -1), updatedLastMessage];
    });
  };
//changed by copilot
  const appendMessage = (role: "user" | "assistant" | "code" | "audio" | "read_aloud", text: string) => {
    setMessages((prev) => [...prev, { role, text }]);
    // Persist message to database
    persistMessage(role, text);
  };

  const annotateLastMessage = (annotations) => {
    setMessages((prevMessages) => {
      const lastMessage = prevMessages[prevMessages.length - 1];
      const updatedLastMessage = {
        ...lastMessage,
      };
      annotations.forEach((annotation) => {
        if (annotation.type === 'file_path') {
          updatedLastMessage.text = updatedLastMessage.text.replaceAll(
            annotation.text,
            `/api/files/${annotation.file_path.file_id}`
          );
        }
      })
      return [...prevMessages.slice(0, -1), updatedLastMessage];
    });
    
  }  

  function handleCheckboxChange(event: React.ChangeEvent<HTMLInputElement>): void {
    setIsChecked(event.target.checked);
  }

  function handleInputOnChange(event: React.ChangeEvent<HTMLInputElement>): void {
    //setIsChecked(event.target.checked);
    setUserInput(event.target.value);

    if(!getIsMuted()) {    
      const muteButton = document.getElementById('muteButton');
      if (muteButton) {
        muteButton.click();
      }
    }
  }  

  return (
    <div className={styles.chatContainer}>
      <div className={styles.messages}>
        {messages.map((msg, index) => (
          <Message key={index} role={msg.role} text={msg.text} items={items} />
        ))}
        <div ref={messagesEndRef} />      
      </div>
      <form
        ref={inputFormRef}
        id="inputForm"
        onSubmit={handleSubmit}
        className={`${styles.inputForm} ${!realtimeClient.isConnected() ? 'no-connection' : ''}`}
        style={{border: '2px solid #ccc',marginLeft: '0px', marginRight: "1px", position: 'relative'}}
      >
        {/* Clear chat history button - positioned above the Mic button */}
        <div
          title="Clear chat history"
          onClick={async () => {
            if (window.confirm('Are you sure you want to clear all chat history for this magazine?')) {
              await clearHistory();
              setMessages([]);
              setItems([]);
            }
          }}
          style={{
            position: 'absolute',
            bottom: `${inputFormHeight + 5}px`,
            right: '5px',
            cursor: 'pointer',
            opacity: 0.5,
            transition: 'opacity 0.2s ease-in-out, bottom 0.15s ease-in-out',
            padding: '4px',
            borderRadius: '50%',
            backgroundColor: 'rgba(255, 255, 255, 0.8)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.opacity = '1'; }}
          onMouseLeave={(e) => { e.currentTarget.style.opacity = '0.5'; }}
        >
          <Trash2 style={{ width: '18px', height: '18px', color: '#666' }} />
        </div>
        <input
          id="chatInputBox"
          type="text"
          className={styles.input}
          value={userInput}
          onChange={handleInputOnChange}
          placeholder={realtimeClient.isConnected()? "Ask me anything..." : "Connect to ask anything!"}
          style={{marginRight: '1px', border: 'none', outline: 'none'}}
          disabled={(deviceType.isTablet || deviceType.isMobile) ? true : false}
        />  
        <Button
          title={realtimeClient.isConnected() ? "" : "Connect to talk"}
          type="submit"
          className={styles.button}
          disabled={realtimeClient.isConnected() ? false : true}
          label={''}
          iconPosition={'end'}
          icon={ getIsMuted() ? MicOff : Mic}          
          style={{fontSize: 'medium', marginLeft: '1px', marginRight: '1px', display: userInput.trim() === '' ? 'flex' :'none' }}
        />                        
        <Button
              title={realtimeClient.isConnected() ? "" : "Connect to chat"}
              type="submit"
              id="submitButton"
              className={styles.button}
              label={''}
              iconPosition={'end'}
              icon= { Send }
              buttonStyle={'regular'}
              onFocus={() => {console.log('Mute/Unmute icon should not be displayed'); }}
              style={{fontSize: 'medium', marginLeft: '1px', marginRight: '0px', display: userInput.trim() === '' ? 'none' :'flex'}}
            /> 
        <input
          id='checkBox'
          type="checkbox"
          title={ realtimeClient.isConnected() ? (isChecked ? "Voice & Text Reply" : "Text-Only Reply") : 'Text-Only Reply'}
          checked={realtimeClient.isConnected()? isChecked : false}
          disabled={!(realtimeClient.isConnected())? true : userInput.trim() === '' ? true : false}
          onChange={handleCheckboxChange}
          style={{display: 'none', position: 'absolute', top: '45%', left: '97%', transform: 'translate(-50%, -50%)', zIndex: 1}}
        />
      </form>        
    </div>
  );
});

export default Chat;