import { GoogleGenAI } from "@google/genai";
import readlineSync from "readline-sync";
import { exec } from "child_process";
import { promisify } from "util";
import os from "os";

const platform = os.platform();
const asyncExecute = promisify(exec);
const History = [];

const ai = new GoogleGenAI({
  apiKey: "" // Replace if needed
});

async function executeCommand({ coin }) {
  try {
    const { stdout, stderr } = await asyncExecute(coin);
    if (stderr) {
      return `Error ${stderr}`;
    }
    return `Success ${stdout} || Task Executed Successfully`;
  } catch (error) {
    return `Error ${error}`;
  }
}

const executeCommandDeclairation = {
  name: "ExecuteCommand",
  description:
    "Execute a single terminal/shell command. A command can be to create a folder, file, write on a file , edit the file or delete the file",
  parameters: {
    type: "OBJECT",
    properties: {
      coin: {
        type: "String",
        description:
          'It will be a single terminal command. Example: "mkDir Calculator" '
      }
    },
    required: ["coin"]
  }
};


const availableTools = {
  ExecuteCommand: executeCommand
};


async function generateWithRetry(config, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      const response = await ai.models.generateContent(config);
      return response;
    } catch (error) {
      if (error.status === 429) {
        const delay = 35000;
        console.log(`⏳ Rate limit hit. Retrying in ${delay / 1000} seconds...`);
        await new Promise((res) => setTimeout(res, delay));
      } else {
        throw error;
      }
    }
  }
  throw new Error("Max retries exceeded due to rate limits.");
}

async function runAgent(userProblem) {
  History.push({
    role: "user",
    parts: [{ text: userProblem }]
  });

  while (true) {
    const response = await generateWithRetry({
      model: "gemini-2.5-flash",
      contents: History,
      config: {
        systemInstruction: `
You are a website builder expert. You must analyze user input and generate terminal commands step by step.

You have access to tools that can execute any terminal command.

Current platform is: ${platform}

--- YOUR TASK ---
1. Understand the website user wants to create.
2. Give terminal commands to:
   - Create a folder for the project
   - Create index.html
   - Create style.css
   - Create script.js
   - Write full HTML into index.html using echo
   - Write full CSS into style.css using echo
   - Write working JS into script.js using echo
3. Add realistic styling and interactivity.
4. Commands should be Windows compatible using: echo ^<tag^> >> file

Example command:
cd MySite && echo ^<h1^>Hello^</h1^> >> index.html
cd MySite && echo body { margin: 0; } >> style.css
cd MySite && echo console.log("Hi") >> script.js
        `,
        tools: [
          {
            functionDeclarations: [executeCommandDeclairation]
          }
        ]
      }
    });

    if (response.functionCalls && response.functionCalls.length > 0) {
      console.log(response.functionCalls[0]);
      const { name, args } = response.functionCalls[0];

      const funCall = availableTools[name];
      const result = await funCall(args);

      const functionResponsePart = {
        name: name,
        response: {
          result: result
        }
      };

      History.push({
        role: "model",
        parts: [{ functionCall: response.functionCalls[0] }]
      });

      History.push({
        role: "user",
        parts: [{ functionResponse: functionResponsePart }]
      });
    } else {
      History.push({
        role: "model",
        parts: [{ text: response.text }]
      });
      console.log(response.text);
      break;
    }
  }
}

async function main() {
  console.log("I am a cursor, lets create a website.");
  const userProblem = readlineSync.question("Ask me anything: ");
  await runAgent(userProblem);
  main();
}

main();
