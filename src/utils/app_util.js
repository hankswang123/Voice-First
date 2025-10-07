// Available Magzines, should be updated when new magzines are added
// Each magzine should have a folder in the public/play folder
// to be used in the dropdown
// The FIRST magzine in the list will be the default magzine
export const magzines = [
    "National_Geographic_Little_Kids_-_July_2022",
    "National_Geographic_Little_Kids_USA_-_September-October_2024",   
    "National_Geographic_Little_Kids_USA_-_November-December_2024"
];

// To fetch the scripts from the public folder
// Keywords are stored in a text file in the format:
//  {
//    "Snowshoe Hare": [128, 164, 12],
//    "Walrus": [166, 218, 18],
//    "Venus": [220, 247, 20]
//  }
// The first number is the start time in seconds
// The second number is the end time in seconds
// The third number is the page number of keywords in the magzine pdf file
// The keywords are used to access the audio position and page in the magzine
// The keywords are maintained manually for now
// TBD: To automate the process of extracting keywords from the audio scripts by AI
// Prompt for kimi视觉思考：
// suggest the keywords as the following format {
//  "Zebra": [26, 56],
// "Markhor": [58, 90] }, 
// the first number is the start time in second of the keyword, and the second number is the end time in seconds of the keword based on scripts: 
// Speaker 1: 00:00  Hey there, explorers. Welcome to our deep dive. Today.
// Speaker 2: 00:03  Uh, yeah.
// ...
// Generate response like following:
// "Zebra":[20,56],
// "Markhor":[58,86],
// "Snow Petrel":[88,119],
// "Snowshoe Hare":[108,144],
// "Walrus":[146,220],
// "Mandrill":[256,291],
// "Mallard Duck":[319,356],
// "Purple Sea Urchin":[364,411],
// "Caracal":[411,459],
// "Raccoon Dog":[462,529],
// "Strawberry Poison Frog":[535,586]
export async function fetchKeywords({magzine} = {magzine: magzines[0]}) {
    try{
        const response = await fetch(`./play/${magzine}/keywords.txt`);
        const data = await response.text();
        const keywords = JSON.parse(data);
        return keywords;
    } catch (error) {
        console.error(error);}
}

// To fetch the audio scripts from the public/play folder
async function fetchAudioScripts({magzine} = {magzine: magzines[0]}) {
    const response = await fetch(`./play/${magzine}/audio_scripts.txt`);
    const script = await response.text();
    return script;
}

export async function getFlashcards({magzine} = {magzine: magzines[0]}) {
    try {
        const response = await fetch(`./play/${magzine}/flashcards.txt`);
        console.log('Fetching flashcards from:', `./play/${magzine}/flashcards.txt`, 'Response status:', response.status);
        const data = await response.text();
        console.log('Raw flashcards data:', data);
        const flashcards = JSON.parse(data);
        console.log('Fetched Fetched Fetched flashcards:', flashcards);
        return flashcards;
    } catch (error) {
        console.error(error);
    }
}

// Function to transform the script into the desired format to be used as audioCaptions
export async function transformAudioScripts({magzine} = {magzine: magzines[0]}) {
    try{
        // To fetch the scripts from the public folder
        const response = await fetch(`./play/${magzine}/audio_scripts.txt`);
        const script = await response.text();

        //const lines = script.trim().split('\n').filter(line => line.trim() !== '');
        const lines = script.trim().split('\n').filter(line => line.trim() !== '');

        const audioCaptions = [];
        let currentTime = 0;

        lines.forEach(line => {
            // Match timestamp and ignore speaker
            const timeMatch = line.match(/(\d{2}):(\d{2})/);
            if (timeMatch) {
                // Convert MM:SS to total seconds
                const minutes = parseInt(timeMatch[1], 10);
                const seconds = parseInt(timeMatch[2], 10);
                currentTime = minutes * 60 + seconds;
            } else {
                // Process line as text
                const text = line.trim();
                if (text) {
                    audioCaptions.push({ time: currentTime, text });
                }
            }
        });

        return audioCaptions;
    }catch (error) {
        console.error(error);}
}

//TTS supported voice options: 'alloy', 'echo', 'shimmer', 'ash', 'coral', 'sage',  'fable', 'onyx', 'nova'
export const tts_voice = 'alloy';

const voiceCommands = `
- You are also an artificial intelligence agent responsible for helping control audio playback by voice commands. You will receive voice control commands from the user and respond with the appropriate action. You may receive the following commands:
 - Always respond with a short reply, e.g. 'OK' when you receive a voice control command

General Guidance Steps:
 - Capture and Analyze User Voice Commands: Obtain the user's voice input and interpret the command's content, such as identifying whether the user intends to start, pause, or adjust the volume.
 - Determine the Context of the User's Command: Understand the context of the user's instruction. For instance, if the user requests to fast-forward, clarify the specific time interval they wish to skip.
 - Seek Clarification for Ambiguous Commands: If the user's command lacks clarity, politely ask for further confirmation to generate an accurate function call.

Examples for how to set the function call signatures:
 - When you received 'stop the audio', 'pause the audio', or similar phrases (or in other languages,e.g. in chinese '停一下'， '暂停') to describe the intent to pause/stop the on-going playback, just set the command as 'pause'
 - When user ask as 'resume the audio', 'continue the audio', 'Please Play the audio', 'start playig the audio'or similar phrases(or in other languages,e.g. in chinese,'继续') to describe the intent to resume the paused playback, just set the command as 'resume'
 - When user ask as 'speed up', 'speed down', or similar phrases(or in other languages, e.g. in chinese '快一点'，'慢一点') to describe the intent to change the playback speed, just set the command as 'speed' and the context as 'up' or 'down' as best as you can understand
 - When user ask as 'Adjust the volume up or down' or simply as 'volume up', 'volume down' to describe the intent to increase or decrease the volume of audio up or down, just set the command as 'volume', the context as 'up' or 'down' as best as you understand
 - When user ask as 'back to normal' to describe the intent to reset the playback speed to normal, just set the command as 'speed' and the context as 'normal'
 - When user ask as 'skip forward', 'skip backward', or similar phrases(or in other languages, e.g. in chinese '快进一点'， '后退一点') to describe the intent to skip the playback, just set the command as 'skip' and the context as 'forward' or 'backward' as you understand
 - When user ask as 'Play the audio from the start' to describe the intent to play the audio from the start, just set the command as 'skip', the context as 'start'
 - When user ask as 'Play the audio from the beginning' to describe the intent to play the audio from the beginning, just set the command as 'skip', the context as 'start'
 - When user ask as 'What is playing right now?' or 'why here the word/phrase/sentence used to say...' to describe the intent(or in other language, e.g. in chinese '正在讨论什么'，'现在在讲什么', '我听不懂') to ask what is talked right now(maybe some words/phrases near by, the user is not quite understood or not hear clearly), just set the command as 'peek', try to explain to user by using the currentTime and duration of the audio you received from the function calling and also the scripts or general knowledge as best as you can.

Notes:
 - Capture Key Action Words: When interpreting user commands, focus on identifying key action words to minimize misunderstandings.
 - Clarify Ambiguous Commands: If a command is unclear, seek clarification from the user to ensure the function call accurately reflects their intent.

 `;

// Function to build the instructions for the audio copilot
export async function buildInstructions({magzine} = {magzine: magzines[0]}) {
    try{
        const basicInstructions = `System settings:
        ##Tool use
        enabled.

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

        ## Sending messages before calling functions
        - If you're going to call a function, ALWAYS let the user know what you're about to do BEFORE calling the function so they're aware of each step.
            - Example: “Okay, I’m going to ask deepseek now.”
            - Example: "Let me create a picture for you."
        - If the function call might take more than a few seconds, ALWAYS let the user know you're still working on it. (For example, “I just need a little more time…” or “Apologies, I’m still working on that now.”)
        - Never leave the user in silence for more than 3 seconds, so continue providing small updates or polite chatter as needed.
        - Example: “I appreciate your patience, just another moment…” or “I’m still working on that, thank you for waiting.”                
        `;
        if (magzine === 'no_scripts') {
            return basicInstructions;
        }
        
        const response = await fetch(`./play/${magzine}/audio_scripts.txt`);
        const audioScripts = await response.text();

        const instructions = `System settings:
        ##Tool use
        enabled.

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

        ## Sending messages before calling functions
        - If you're going to call a function, ALWAYS let the user know what you're about to do BEFORE calling the function so they're aware of each step.
            - Example: “Okay, I’m going to ask deepseek now.”
            - Example: "Let me create a picture for you."
        - If the function call might take more than a few seconds, ALWAYS let the user know you're still working on it. (For example, “I just need a little more time…” or “Apologies, I’m still working on that now.”)
        - Never leave the user in silence for more than 3 seconds, so continue providing small updates or polite chatter as needed.
        - Example: “I appreciate your patience, just another moment…” or “I’m still working on that, thank you for waiting.”                

        Instructions:

        General Instructions:
        - You are an audio copilot, which will transform the passive listening experience into an interactive and engaging one. You will help the user understand the on-going playback and provide answers to their questions.

        Audio Scripts with timestamp:
        - Here are the audio scripts: ${audioScripts}, you can use this an knowledge base when providing an answer to user.               

        Voice Control Instructions:
        Voice Control Instructions for function call audio_control: ${voiceCommands}
        
        Function Call for Translate the current senense Instruction:
        - when function: translation_current_sentence is called, you should translate the current sentence to the requested language and return the translated sentence.
        - The current sentence is the sentence that is currently being played in the audio.
        - The current time and duration of the audio should be used to determine the current sentence.

        Function Call for search video from youtube Instruction:
        - just provide simple response like indicated in the return info when you receive the command to search video from youtube. 

        Function Call for learning/exploring by keyword/topic Instruction:
        - you will receive a keyword with the start time and end time to locate audio segment talking about the keyword.
        - you will play as an english teacher role to lead the user to learn the content related to the keyword.
        - you should start to provide some basic words(from the scripts) which are prequiste to understand the keyword and ask to repeat the user to repeat or practice with you together.
        - then you will explain the scripts from the start time to the end time of the scripts sentence by sentence.
        - then you will play the audio segment from the start time to the end time of the keyword for enghlish hearing practice.
        - then you will ask the user some questions about the information between the start time to the end time to check user has understood.
        - At last you will wrap up what has been learned and ask the user to continue or ask more questions.

        Other important instruction should be followed during interaction:
        - Simplify and Clarify Extracted Content: After identifying relevant information, explain the concepts or statements from the audio using simplified and easily understandable language.
        - Provide Necessary Background Information: If the question involves implicit context or requires additional background, offer relevant explanations, possibly referencing other parts of the audio.
        - Offer Multiple Interpretations When Applicable: If there are several possible explanations, present multiple options and encourage the user to select the one that aligns with their understanding.
        - Define Terms in Layman's Language: When addressing terminology, strive to define terms using simple language, avoiding complex industry-specific jargon.
        - Always provide a transition phrase at the end of each reply no more than five words, like "ok", "sure"... etc.
        - If the answer you received, like "OK", "OK, please", "Please go ahead", "OK, continue", "OK, continue playing", "OK, continue reading", "OK, continue with the news", "OK, "continue with the audio"... etc, you do not need to respond. The audio will be resumed soon.
        - If you do not know the answer based the audio scripts, try to reply based on general knowledge as best as you can as a general AI assistant. 
        - If you realy do not know the answer based the audio scripts and your general knowledge, you can say "I am not sure, but I can help you with other questions."              
        - If user asks "Please go ahead", "OK, continue", "OK, continue playing", "OK, continue reading", "OK, continue with the news", "OK, "continue with the audio", you just simply reply "OK" or "好的" depending the user's language.
        - Be kind, helpful, and curteous
        - It is okay to ask the user questions
        - Use tools and functions you have available liberally, it is part of the training apparatus
        - Be open to exploration and conversation
        `;        

        // Personality:
        //  - Be upbeat and genuine
        //  - Try speaking quickly as if excited

        return instructions;
    }catch (error) {
        console.error(error);}
}

/**
 * Analyzes the audio scripts file and extracts keywords with their timings.
 * Returns the result as a JSON object.
 * @returns {Promise<Object>} - A promise that resolves to an object containing keywords and their timings.
 */
export async function genKeywords( {magzine} = {magzine: magzines[0]} ) {
    const keywordPatternStart = /(keyword\d+):\[\s*([\w\s]+)\s*:(\d+)\s*\]\s*(\d+):\s*(\d{2}:\d{2})/;
    const keywordPatternEnd = /(keyword\d+):\[(\w+(?:\s\w+)*)\]\s*(\d+):\s*(\d{2}):(\d{2})/;

    try {
        //const data = await fs.readFile(filePath, 'utf8');
        const response = await fetch(`./play/${magzine}/audio_scripts.txt`);
        const audioScripts = await response.text();        
        const keywords = {};
        let match;

        const lines = audioScripts.split('\n');
        for (const line of lines) {
            match = keywordPatternStart.exec(line);
            if (match) {
                const keyword = match[2];
                const pageNumber = parseInt(match[3], 10);
                const [minutes, seconds] = match[5].split(":").map(Number);         
                const startTime = minutes * 60 + seconds; // Convert to seconds

                if (!keywords[keyword]) {
                    keywords[keyword] = [];
                }
                keywords[keyword] = [startTime, 0, pageNumber];
                match = null;
            } else {
                match = keywordPatternEnd.exec(line);
                if (match) {
                    const keyword = match[2].trim(); // "Arctic fox"
                    const minutes = parseInt(match[4], 10); // 1 (minutes)
                    const seconds = parseInt(match[5], 10); // 44 (seconds)  
                    const endTime = minutes * 60 + seconds;                  
                    const lastKeyword = Object.keys(keywords).pop();
                    if (lastKeyword && keyword === lastKeyword) {
                        keywords[lastKeyword][1] = endTime; // Update endTime
                    }
                }
            }
        }

        return keywords;
    } catch (error) {
        console.error('Error reading or analyzing the audio scripts file:', error);
        throw error;
    }
}