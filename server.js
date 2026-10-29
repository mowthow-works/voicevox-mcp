#!/usr/bin/env node
/**
 * VOICEVOX MCP Server
 * Model Context Protocol server for interacting with VOICEVOX Engine:
 * - Text-to-Speech (TTS)
 * - Singing Voice Synthesis (Song)
 * - VOICEVOX Project (.vvproj) Generation
 * - Audio Playback & Character Guidelines
 */

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { spawn, execSync } = require('child_process');
const readline = require('readline');

const DEFAULT_ENGINE_URL = process.env.VOICEVOX_ENGINE_URL || 'http://127.0.0.1:50021';

// HTTP Request Helper
function requestEngine(method, endpoint, body = null, isBinary = false) {
  return new Promise((resolve, reject) => {
    const url = new URL(endpoint, DEFAULT_ENGINE_URL);
    const options = {
      method,
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      headers: {}
    };

    let postData = null;
    if (body !== null) {
      postData = typeof body === 'string' ? body : JSON.stringify(body);
      options.headers['Content-Type'] = typeof body === 'string' ? 'application/x-www-form-urlencoded' : 'application/json';
      options.headers['Content-Length'] = Buffer.byteLength(postData);
    }

    const req = http.request(options, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => {
        const buffer = Buffer.concat(chunks);
        if (res.statusCode < 200 || res.statusCode >= 300) {
          return reject(new Error(`Engine responded with HTTP ${res.statusCode}: ${buffer.toString('utf8')}`));
        }
        if (isBinary) {
          resolve(buffer);
        } else {
          try {
            resolve(JSON.parse(buffer.toString('utf8')));
          } catch (e) {
            resolve(buffer.toString('utf8'));
          }
        }
      });
    });

    req.on('error', (err) => {
      reject(new Error(`Failed to connect to VOICEVOX Engine at ${DEFAULT_ENGINE_URL}: ${err.message}. Is VOICEVOX running?`));
    });

    if (postData) {
      req.write(postData);
    }
    req.end();
  });
}

// Audio Playback Helper
function playAudio(filePath) {
  return new Promise((resolve) => {
    const platform = os.platform();
    let command;

    if (platform === 'win32') {
      const escaped = filePath.replace(/'/g, "''");
      command = `powershell -NoProfile -Command "(New-Object Media.SoundPlayer '${escaped}').PlaySync()"`;
    } else if (platform === 'darwin') {
      command = `afplay "${filePath}"`;
    } else {
      command = `aplay "${filePath}" || paplay "${filePath}"`;
    }

    try {
      execSync(command, { stdio: 'ignore' });
      resolve({ success: true });
    } catch (err) {
      resolve({ success: false, error: err.message });
    }
  });
}

// MCP Tools Definition
const TOOLS = [
  {
    name: 'voicevox_status',
    description: 'Check the status and version of the local VOICEVOX Engine (default: http://127.0.0.1:50021).',
    inputSchema: {
      type: 'object',
      properties: {},
      required: []
    }
  },
  {
    name: 'voicevox_get_speakers',
    description: 'Get the list of available characters (speakers) and styles, including their speaker IDs.',
    inputSchema: {
      type: 'object',
      properties: {
        singersOnly: {
          type: 'boolean',
          description: 'If true, returns only characters and styles that support song/singing synthesis.',
          default: false
        }
      },
      required: []
    }
  },
  {
    name: 'voicevox_speak',
    description: 'Synthesize speech from Japanese text using VOICEVOX and save to a WAV file, with optional playback.',
    inputSchema: {
      type: 'object',
      properties: {
        text: {
          type: 'string',
          description: 'Japanese text to synthesize.'
        },
        speaker: {
          type: 'integer',
          description: 'Speaker style ID (e.g. 2 for 四国めたん ノーマル, 3 for ずんだもん ノーマル). Default: 3.',
          default: 3
        },
        outputPath: {
          type: 'string',
          description: 'Absolute path to save the generated WAV file. If omitted, saved to a temporary file.'
        },
        play: {
          type: 'boolean',
          description: 'Whether to immediately play the generated speech through the PC speakers. Default: false.',
          default: false
        },
        speedScale: {
          type: 'number',
          description: 'Speech speed scale (0.50 to 2.00). Default: 1.0.',
          default: 1.0
        },
        pitchScale: {
          type: 'number',
          description: 'Pitch scale (-0.15 to 0.15). Default: 0.0.',
          default: 0.0
        },
        intonationScale: {
          type: 'number',
          description: 'Intonation scale (0.0 to 2.0). Default: 1.0.',
          default: 1.0
        },
        volumeScale: {
          type: 'number',
          description: 'Volume scale (0.0 to 2.0). Default: 1.0.',
          default: 1.0
        }
      },
      required: ['text']
    }
  },
  {
    name: 'voicevox_create_song_project',
    description: 'Create a VOICEVOX Song project file (.vvproj) from note events, lyrics, and tempo. Can be opened directly in the VOICEVOX GUI for fine-tuning.',
    inputSchema: {
      type: 'object',
      properties: {
        outputPath: {
          type: 'string',
          description: 'Absolute path to save the .vvproj project file.'
        },
        notes: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              lyric: {
                type: 'string',
                description: 'Japanese lyric in Hiragana/Katakana for this note (e.g. "い", "く", "ぞ").'
              },
              noteNumber: {
                type: 'integer',
                description: 'MIDI note number (e.g. 60 for C4 / ド, 62 for D4, 69 for A4 / 440Hz).'
              },
              position: {
                type: 'integer',
                description: 'Start position in ticks (tpqn=480, quarter note = 480 ticks, 16th note = 120 ticks).'
              },
              duration: {
                type: 'integer',
                description: 'Duration in ticks (tpqn=480, quarter note = 480 ticks, 8th note = 240 ticks).'
              }
            },
            required: ['lyric', 'noteNumber', 'position', 'duration']
          },
          description: 'Array of musical notes.'
        },
        bpm: {
          type: 'number',
          description: 'Tempo in BPM (beats per minute). Default: 120.',
          default: 120
        },
        styleId: {
          type: 'integer',
          description: 'Singing style ID (e.g. 6000 for 九州そら, 3000 for 波音リツ). Default: 6000.',
          default: 6000
        },
        trackName: {
          type: 'string',
          description: 'Name of the vocal track. Default: "Vocal Track".',
          default: 'Vocal Track'
        }
      },
      required: ['outputPath', 'notes']
    }
  },
  {
    name: 'voicevox_sing',
    description: 'Synthesize singing audio directly from musical notes using VOICEVOX Song/Frame synthesis or audio queries, outputting a WAV file.',
    inputSchema: {
      type: 'object',
      properties: {
        notes: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              lyric: { type: 'string', description: 'Japanese lyric (Hiragana)' },
              noteNumber: { type: 'integer', description: 'MIDI note number (e.g. 60 for C4)' },
              position: { type: 'integer', description: 'Position in ticks (tpqn=480)' },
              duration: { type: 'integer', description: 'Duration in ticks (tpqn=480)' }
            },
            required: ['lyric', 'noteNumber', 'position', 'duration']
          },
          description: 'Array of musical notes.'
        },
        styleId: {
          type: 'integer',
          description: 'Singing style ID (e.g. 6000 for 九州そら, 3000 for 波音リツ). Default: 6000.',
          default: 6000
        },
        bpm: {
          type: 'number',
          description: 'Tempo in BPM. Default: 120.',
          default: 120
        },
        outputPath: {
          type: 'string',
          description: 'Absolute path to save the rendered singing WAV file.'
        },
        play: {
          type: 'boolean',
          description: 'Whether to immediately play the generated song. Default: false.',
          default: false
        }
      },
      required: ['notes', 'outputPath']
    }
  },
  {
    name: 'voicevox_play_audio',
    description: 'Play an existing audio file (WAV or MP3) through system speakers.',
    inputSchema: {
      type: 'object',
      properties: {
        filePath: {
          type: 'string',
          description: 'Path to audio file.'
        }
      },
      required: ['filePath']
    }
  },
  {
    name: 'voicevox_get_character_info',
    description: 'Get credit notation templates and character licensing guidelines for VOICEVOX characters (e.g. ずんだもん, 四国めたん).',
    inputSchema: {
      type: 'object',
      properties: {
        characterName: {
          type: 'string',
          description: 'Character name (e.g. "ずんだもん", "四国めたん", "春日部つむぎ"). If omitted, general guidelines are returned.'
        }
      },
      required: []
    }
  }
];

// Tool Implementation Handlers
async function callTool(name, args) {
  switch (name) {
    case 'voicevox_status': {
      try {
        const version = await requestEngine('GET', '/version');
        return {
          status: 'running',
          engineUrl: DEFAULT_ENGINE_URL,
          version: typeof version === 'string' ? version : JSON.stringify(version)
        };
      } catch (err) {
        return {
          status: 'error',
          engineUrl: DEFAULT_ENGINE_URL,
          message: err.message,
          suggestion: 'Please start the VOICEVOX desktop application or docker container (voicevox_engine).'
        };
      }
    }

    case 'voicevox_get_speakers': {
      const singersOnly = !!args.singersOnly;
      if (singersOnly) {
        try {
          const singers = await requestEngine('GET', '/singers');
          return { count: singers.length, singers };
        } catch (e) {
          // Fallback: get speakers and filter styles with 'song' or known song styles
          const speakers = await requestEngine('GET', '/speakers');
          return {
            note: 'Singers endpoint not supported; returning all speakers with styles.',
            speakers: speakers.map(s => ({
              name: s.name,
              speaker_uuid: s.speaker_uuid,
              styles: s.styles
            }))
          };
        }
      }

      const speakers = await requestEngine('GET', '/speakers');
      return {
        count: speakers.length,
        speakers: speakers.map(s => ({
          name: s.name,
          speaker_uuid: s.speaker_uuid,
          styles: s.styles
        }))
      };
    }

    case 'voicevox_speak': {
      const text = args.text;
      const speaker = args.speaker !== undefined ? args.speaker : 3;
      const speedScale = args.speedScale !== undefined ? args.speedScale : 1.0;
      const pitchScale = args.pitchScale !== undefined ? args.pitchScale : 0.0;
      const intonationScale = args.intonationScale !== undefined ? args.intonationScale : 1.0;
      const volumeScale = args.volumeScale !== undefined ? args.volumeScale : 1.0;
      const shouldPlay = !!args.play;

      // 1. Audio Query
      const queryEndpoint = `/audio_query?text=${encodeURIComponent(text)}&speaker=${speaker}`;
      const query = await requestEngine('POST', queryEndpoint);

      // Adjust scales
      query.speedScale = speedScale;
      query.pitchScale = pitchScale;
      query.intonationScale = intonationScale;
      query.volumeScale = volumeScale;

      // 2. Synthesis
      const synthesisEndpoint = `/synthesis?speaker=${speaker}`;
      const wavBuffer = await requestEngine('POST', synthesisEndpoint, query, true);

      // 3. Save to output path
      let outPath = args.outputPath;
      if (!outPath) {
        const tmpFile = `voicevox_${Date.now()}_${Math.random().toString(36).substring(2, 6)}.wav`;
        outPath = path.join(os.tmpdir(), tmpFile);
      } else {
        const dir = path.dirname(outPath);
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true });
        }
      }

      fs.writeFileSync(outPath, wavBuffer);

      let played = false;
      let playError = null;
      if (shouldPlay) {
        const playRes = await playAudio(outPath);
        played = playRes.success;
        playError = playRes.error;
      }

      return {
        success: true,
        text,
        speaker,
        outputPath: outPath,
        fileSizeBytes: wavBuffer.length,
        played,
        playError
      };
    }

    case 'voicevox_create_song_project': {
      const outputPath = args.outputPath;
      const notes = args.notes || [];
      const bpm = args.bpm || 120;
      const styleId = args.styleId || 6000;
      const trackName = args.trackName || 'Vocal Track';

      const trackId = crypto.randomUUID();
      const audioItemId = crypto.randomUUID();

      const formattedNotes = notes.map((n, idx) => ({
        id: crypto.randomUUID(),
        position: n.position,
        duration: n.duration,
        noteNumber: n.noteNumber,
        lyric: n.lyric
      }));

      const vvproj = {
        appVersion: '0.26.1',
        talk: {
          audioKeys: [audioItemId],
          audioItems: {
            [audioItemId]: {
              text: '',
              voice: {
                engineId: '074fc39e-678b-4c13-8916-ffca8d505d1d',
                speakerId: '7ffcb7ce-00ec-4bdc-82cd-45a8889e43ff',
                styleId: 2
              },
              query: {
                accentPhrases: [],
                speedScale: 1,
                pitchScale: 0,
                intonationScale: 1,
                volumeScale: 1,
                pauseLengthScale: 1,
                prePhonemeLength: 0.1,
                postPhonemeLength: 0.1,
                outputSamplingRate: 24000,
                outputStereo: false,
                kana: ''
              },
              presetKey: crypto.randomUUID()
            }
          }
        },
        song: {
          tpqn: 480,
          tempos: [{ position: 0, bpm }],
          timeSignatures: [{ measureNumber: 1, beats: 4, beatType: 4 }],
          tracks: {
            [trackId]: {
              name: trackName,
              singer: {
                engineId: '074fc39e-678b-4c13-8916-ffca8d505d1d',
                styleId
              },
              singingTeacher: {
                styleId
              },
              keyRangeAdjustment: 0,
              volumeRangeAdjustment: 1,
              notes: formattedNotes,
              pitchEditData: [],
              volumeEditData: [],
              phonemeTimingEditData: {},
              solo: false,
              mute: false,
              gain: 1,
              pan: 0
            }
          },
          trackOrder: [trackId]
        }
      };

      const dir = path.dirname(outputPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      fs.writeFileSync(outputPath, JSON.stringify(vvproj, null, 2), 'utf8');

      return {
        success: true,
        outputPath,
        totalNotes: formattedNotes.length,
        bpm,
        styleId,
        message: 'VOICEVOX Project (.vvproj) created successfully. You can open and edit it in VOICEVOX GUI.'
      };
    }

    case 'voicevox_sing': {
      const outputPath = args.outputPath;
      const notes = args.notes || [];
      const bpm = args.bpm || 120;
      const styleId = args.styleId || 6000;
      const shouldPlay = !!args.play;

      // Attempt Engine Song/Frame API:
      // Try /sing_frame_audio_query or score query
      let wavBuffer = null;
      try {
        const scoreData = {
          notes: notes.map(n => ({
            lyric: n.lyric,
            key: n.noteNumber,
            frame_length: Math.round((n.duration / 480) * (60 / bpm) * 93.75) // 93.75 frames/sec
          }))
        };
        const query = await requestEngine('POST', `/sing_frame_audio_query?speaker=${styleId}`, scoreData);
        wavBuffer = await requestEngine('POST', `/frame_synthesis?speaker=${styleId}`, query, true);
      } catch (songErr) {
        // Fallback: create .vvproj and inform user
        const vvprojPath = outputPath.replace(/\.wav$/i, '.vvproj');
        await callTool('voicevox_create_song_project', {
          outputPath: vvprojPath,
          notes,
          bpm,
          styleId
        });
        return {
          success: false,
          error: `Direct singing synthesis is not directly supported by current Engine endpoint: ${songErr.message}`,
          vvprojCreated: vvprojPath,
          suggestion: 'A .vvproj file has been generated. Open it in VOICEVOX GUI to render or adjust the song track.'
        };
      }

      const dir = path.dirname(outputPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(outputPath, wavBuffer);

      let played = false;
      if (shouldPlay) {
        const res = await playAudio(outputPath);
        played = res.success;
      }

      return {
        success: true,
        outputPath,
        fileSizeBytes: wavBuffer.length,
        played
      };
    }

    case 'voicevox_play_audio': {
      const filePath = args.filePath;
      if (!fs.existsSync(filePath)) {
        throw new Error(`File not found: ${filePath}`);
      }
      const playRes = await playAudio(filePath);
      return {
        success: playRes.success,
        filePath,
        error: playRes.error
      };
    }

    case 'voicevox_get_character_info': {
      const char = args.characterName || '';
      return {
        generalRule: 'VOICEVOX audio requires character attribution / credit in works. E.g.: "VOICEVOX:ずんだもん"',
        characters: [
          {
            name: 'ずんだもん',
            styles: ['ノーマル (ID: 3)', 'あまあま (ID: 1)', 'ツンツン (ID: 7)', 'セクシー (ID: 5)', 'ささやき (ID: 22)', 'ヒソヒソ (ID: 38)'],
            creditExample: 'VOICEVOX:ずんだもん',
            termsUrl: 'https://zunko.jp/guideline.html'
          },
          {
            name: '四国めたん',
            styles: ['ノーマル (ID: 2)', 'あまあま (ID: 0)', 'ツンツン (ID: 6)', 'セクシー (ID: 4)', 'ささやき (ID: 36)', 'ヒソヒソ (ID: 37)'],
            creditExample: 'VOICEVOX:四国めたん',
            termsUrl: 'https://zunko.jp/guideline.html'
          },
          {
            name: '春日部つむぎ',
            styles: ['ノーマル (ID: 8)'],
            creditExample: 'VOICEVOX:春日部つむぎ',
            termsUrl: 'https://tsumugi-official.studio.site/rule'
          },
          {
            name: '九州そら',
            styles: ['ノーマル (ID: 16)', 'ソング (ID: 6000)'],
            creditExample: 'VOICEVOX:九州そら',
            termsUrl: 'https://zunko.jp/guideline.html'
          },
          {
            name: '波音リツ',
            styles: ['ノーマル (ID: 9)', 'ソング (ID: 3000)'],
            creditExample: 'VOICEVOX:波音リツ',
            termsUrl: 'http://canon-voice.com/kiyaku.html'
          }
        ]
      };
    }

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

// MCP JSON-RPC Server
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  terminal: false
});

rl.on('line', async (line) => {
  const trimmed = line.trim();
  if (!trimmed) return;

  let message;
  try {
    message = JSON.parse(trimmed);
  } catch (err) {
    const errorResponse = {
      jsonrpc: '2.0',
      id: null,
      error: { code: -32700, message: `Parse error: ${err.message}` }
    };
    process.stdout.write(JSON.stringify(errorResponse) + '\n');
    return;
  }

  const { id, method, params } = message;

  function sendResult(result) {
    const response = {
      jsonrpc: '2.0',
      id,
      result
    };
    process.stdout.write(JSON.stringify(response) + '\n');
  }

  function sendError(code, message, data) {
    const response = {
      jsonrpc: '2.0',
      id,
      error: { code, message, data }
    };
    process.stdout.write(JSON.stringify(response) + '\n');
  }

  try {
    switch (method) {
      case 'initialize':
        sendResult({
          protocolVersion: '2024-11-05',
          capabilities: {
            tools: {}
          },
          serverInfo: {
            name: 'voicevox-mcp',
            version: '1.0.0'
          }
        });
        break;

      case 'ping':
        sendResult({});
        break;

      case 'tools/list':
        sendResult({
          tools: TOOLS
        });
        break;

      case 'tools/call': {
        const toolName = params?.name;
        const toolArgs = params?.arguments || {};
        try {
          const textResult = await callTool(toolName, toolArgs);
          sendResult({
            content: [
              {
                type: 'text',
                text: typeof textResult === 'string' ? textResult : JSON.stringify(textResult, null, 2)
              }
            ],
            isError: false
          });
        } catch (toolError) {
          sendResult({
            content: [
              {
                type: 'text',
                text: `Error executing tool ${toolName}: ${toolError.message}`
              }
            ],
            isError: true
          });
        }
        break;
      }

      default:
        sendError(-32601, `Method not found: ${method}`);
        break;
    }
  } catch (err) {
    sendError(-32603, `Internal error: ${err.message}`);
  }
});

process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception in VOICEVOX MCP:', err);
});
