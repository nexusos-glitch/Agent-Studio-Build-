import { useState, useRef, useEffect } from "react";
import { Sparkles, Settings, Copy, Check, Wand2, Loader2, Maximize2, Mic, MicOff, Trash2, History, Clock, Download, FileText, File, Bold, Italic, Underline as UnderlineIcon, Undo, Redo, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "./components/ui/button";
import { Textarea } from "./components/ui/textarea";
import { Label } from "./components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./components/ui/select";
import { Separator } from "./components/ui/separator";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "./components/ui/sheet";
import { ScrollArea } from "./components/ui/scroll-area";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "./components/ui/dropdown-menu";
import { Toaster, toast } from "sonner";
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import { marked } from 'marked';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "./components/ui/tooltip";
import { jsPDF } from "jspdf";
import { Document, Packer, Paragraph, TextRun } from "docx";
import { saveAs } from "file-saver";
import LanguageDetect from 'languagedetect';

const lngDetector = new LanguageDetect();

interface HistoryItem {
  id: string;
  timestamp: number;
  inputText: string;
  outputText: string;
  tone: string;
  length: string;
  language: string;
}

export default function App() {
  const [inputText, setInputText] = useState("");
  const [outputText, setOutputText] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  
  // Configuration State
  const [tone, setTone] = useState("Professional");
  const [length, setLength] = useState("Same Length");
  const [language, setLanguage] = useState("English");
  
  const [isCopied, setIsCopied] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [voiceCommand, setVoiceCommand] = useState<string | null>(null);
  
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);

  // Suggestions state
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [suggestionIndex, setSuggestionIndex] = useState(0);
  const suggestionTimeoutRef = useRef<any>(null);

  // Synonyms state
  const [synonyms, setSynonyms] = useState<string[]>([]);
  const [showSynonyms, setShowSynonyms] = useState(false);
  const [selectedWordRange, setSelectedWordRange] = useState<{start: number, end: number, text: string} | null>(null);
  const [isFetchingSynonyms, setIsFetchingSynonyms] = useState(false);
  const selectedWordTimeoutRef = useRef<any>(null);

  const recognitionRef = useRef<any>(null);
  const originalTextRef = useRef("");

  const editor = useEditor({
    extensions: [StarterKit, Underline],
    content: outputText,
    onUpdate: ({ editor }) => {
      setOutputText(editor.getHTML());
    },
    editorProps: {
      attributes: {
        class: 'h-full outline-none'
      }
    }
  });

  useEffect(() => {
    if (editor && outputText && outputText !== editor.getHTML()) {
      try {
        const parsedHtml = marked.parse(outputText) as string;
        editor.commands.setContent(parsedHtml);
        setOutputText(parsedHtml);
      } catch (e) {
        console.error("Markdown parsing error", e);
      }
    } else if (editor && !outputText) {
      editor.commands.setContent('');
    }
  }, [outputText, editor]);

  useEffect(() => {
    const saved = localStorage.getItem("polisher_history");
    if (saved) {
      try {
        setHistory(JSON.parse(saved));
      } catch (e) {
        console.error("Failed to load history", e);
      }
    }

    const savedInputText = localStorage.getItem("polisher_draft_input");
    if (savedInputText) {
      setInputText(savedInputText);
    }
  }, []);

  const inputTextRef = useRef(inputText);
  useEffect(() => {
    inputTextRef.current = inputText;

    // Handle auto-suggest
    if (inputText.trim().length > 3) {
      if (suggestionTimeoutRef.current) clearTimeout(suggestionTimeoutRef.current);
      
      suggestionTimeoutRef.current = setTimeout(async () => {
        // Detect language
        const detected = lngDetector.detect(inputText, 1);
        if (detected && detected.length > 0) {
          const lang = detected[0][0].toLowerCase();
          switch (lang) {
            case 'english': setLanguage('English'); break;
            case 'spanish': setLanguage('Spanish'); break;
            case 'french': setLanguage('French'); break;
            case 'german': setLanguage('German'); break;
            case 'polish': setLanguage('Polish'); break;
            case 'japanese': setLanguage('Japanese'); break;
          }
        }

        try {
          const res = await fetch("/api/suggest", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ text: inputText }),
          });
          if (res.ok) {
            const data = await res.json();
            if (data.suggestions && data.suggestions.length > 0) {
              setSuggestions(data.suggestions);
              setSuggestionIndex(0);
              setShowSuggestions(true);
            } else {
              setShowSuggestions(false);
            }
          }
        } catch (e) {
          console.error("Suggest error:", e);
        }
      }, 600); // 600ms debounce
    } else {
      setSuggestions([]);
      setShowSuggestions(false);
    }
  }, [inputText]);

  useEffect(() => {
    const intervalId = setInterval(() => {
      localStorage.setItem("polisher_draft_input", inputTextRef.current);
    }, 30000);
    return () => clearInterval(intervalId);
  }, []);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (SpeechRecognition) {
        recognitionRef.current = new SpeechRecognition();
        recognitionRef.current.continuous = true;
        recognitionRef.current.interimResults = true;

        let finalTranscript = "";

        recognitionRef.current.onstart = () => {
          finalTranscript = "";
        };

        recognitionRef.current.onresult = (event: any) => {
          let interimTranscript = "";
          for (let i = event.resultIndex; i < event.results.length; ++i) {
            const transcript = event.results[i][0].transcript;
            
            if (event.results[i].isFinal) {
              const cleanedTranscript = transcript.trim().toLowerCase().replace(/[.,!?;]+$/, '');
              if (cleanedTranscript === "clear input" || cleanedTranscript === "clear text") {
                finalTranscript = "";
                originalTextRef.current = "";
                toast.success("Input cleared via voice command.");
                continue;
              } else if (cleanedTranscript === "polish text" || cleanedTranscript === "polish my text") {
                setVoiceCommand("polish");
                recognitionRef.current.stop();
                continue;
              } else if (cleanedTranscript === "show history" || cleanedTranscript === "open history") {
                setVoiceCommand("history");
                recognitionRef.current.stop();
                continue;
              }
              finalTranscript += transcript;
            } else {
              interimTranscript += transcript;
            }
          }
          
          setInputText(originalTextRef.current + finalTranscript + interimTranscript);
        };

        recognitionRef.current.onerror = (event: any) => {
          console.error("Speech recognition error:", event.error);
          setIsRecording(false);
          toast.error("Microphone error. Please ensure permissions are granted.");
        };

        recognitionRef.current.onend = () => {
          setIsRecording(false);
        };
      }
    }
  }, []);

  const toggleRecording = () => {
    if (!recognitionRef.current) {
      toast.error("Speech recognition is not supported in this browser.");
      return;
    }

    if (isRecording) {
      recognitionRef.current.stop();
    } else {
      originalTextRef.current = inputText + (inputText.length > 0 && !inputText.endsWith(" ") ? " " : "");
      try {
        recognitionRef.current.start();
        setIsRecording(true);
        toast.message("Listening...");
      } catch (e: any) {
        console.error(e);
        toast.error("Could not start recording: " + e.message);
      }
    }
  };

  const fetchSynonyms = async (word: string, context: string) => {
    setIsFetchingSynonyms(true);
    setShowSynonyms(true);
    setSynonyms([]);
    
    try {
      const res = await fetch("/api/synonyms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ word, context }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.synonyms && data.synonyms.length > 0) {
          setSynonyms(data.synonyms);
        } else {
          setShowSynonyms(false);
        }
      }
    } catch (e) {
      console.error("Synonyms error:", e);
      setShowSynonyms(false);
    } finally {
      setIsFetchingSynonyms(false);
    }
  };

  const handleSelection = (e: any) => {
    const target = e.target;
    if (selectedWordTimeoutRef.current) clearTimeout(selectedWordTimeoutRef.current);
    
    selectedWordTimeoutRef.current = setTimeout(() => {
      const start = target.selectionStart;
      const end = target.selectionEnd;
      if (start !== end) {
        const text = target.value.substring(start, end);
        if (text.trim() && text.trim().split(/\s+/).length <= 2) {
          setSelectedWordRange({ start, end, text: text.trim() });
          fetchSynonyms(text.trim(), target.value.substring(Math.max(0, start - 30), Math.min(target.value.length, end + 30)));
        } else {
          setShowSynonyms(false);
        }
      } else {
        setShowSynonyms(false);
      }
    }, 200); // 200ms debounce
  };

  const handlePolish = async () => {
    if (!inputText.trim()) {
      toast.error("Please enter some text to polish.");
      return;
    }

    setIsLoading(true);
    setOutputText("");
    
    try {
      const response = await fetch("/api/polish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: inputText,
          tone,
          length,
          language
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to polish text");
      }

      setOutputText(data.polishedText);

      const newItem: HistoryItem = {
        id: Date.now().toString(),
        timestamp: Date.now(),
        inputText: inputText,
        outputText: data.polishedText,
        tone,
        length,
        language
      };
      
      setHistory(prev => {
        const updated = [newItem, ...prev].slice(0, 50);
        localStorage.setItem("polisher_history", JSON.stringify(updated));
        return updated;
      });

      toast.success("Text polished successfully!");
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setIsLoading(false);
    }
  };

  const getPlainText = () => {
    return editor ? editor.getText() : outputText.replace(/<[^>]+>/g, '');
  };

  const copyToClipboard = async () => {
    if (!outputText) return;
    try {
      if (editor) {
        const html = editor.getHTML();
        const text = editor.getText();
        const clipboardItem = new ClipboardItem({
          "text/plain": new Blob([text], { type: "text/plain" }),
          "text/html": new Blob([html], { type: "text/html" }),
        });
        await navigator.clipboard.write([clipboardItem]);
      } else {
        await navigator.clipboard.writeText(getPlainText());
      }
      setIsCopied(true);
      toast("Copied to clipboard");
      setTimeout(() => setIsCopied(false), 2000);
    } catch (e) {
      console.error(e);
      navigator.clipboard.writeText(getPlainText());
      setIsCopied(true);
      toast("Copied to clipboard");
      setTimeout(() => setIsCopied(false), 2000);
    }
  };

  const downloadTxt = () => {
    if (!outputText) return;
    const blob = new Blob([getPlainText()], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `polished_text_${new Date().getTime()}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success("Text exported as .txt");
  };

  const downloadDocx = async () => {
    if (!outputText) return;
    try {
      const doc = new Document({
        sections: [
          {
            properties: {},
            children: getPlainText().split('\n').map(line => new Paragraph({
              children: [new TextRun(line)],
            })),
          },
        ],
      });

      const blob = await Packer.toBlob(doc);
      saveAs(blob, `polished_text_${new Date().getTime()}.docx`);
      toast.success("Text exported as .docx");
    } catch (error) {
      console.error(error);
      toast.error("Failed to export as .docx");
    }
  };

  const downloadPdf = () => {
    if (!outputText) return;
    try {
      const doc = new jsPDF();
      const splitText = doc.splitTextToSize(getPlainText(), 180);
      doc.text(splitText, 15, 15);
      doc.save(`polished_text_${new Date().getTime()}.pdf`);
      toast.success("Text exported as .pdf");
    } catch (error) {
      console.error(error);
      toast.error("Failed to export as .pdf");
    }
  };

  const revertToHistory = (item: HistoryItem) => {
    setInputText(item.inputText);
    setOutputText(item.outputText);
    setTone(item.tone);
    setLength(item.length);
    setLanguage(item.language);
    setIsHistoryOpen(false);
    toast.success("Reverted to previous version");
  };

  useEffect(() => {
    if (voiceCommand) {
      if (voiceCommand === "polish") {
        toast.success("Polishing text...");
        handlePolish();
      } else if (voiceCommand === "history") {
        setIsHistoryOpen(true);
      }
      setVoiceCommand(null);
    }
  }, [voiceCommand, handlePolish]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Cmd/Ctrl + Enter -> Polish
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault();
        handlePolish();
      }
      
      // Cmd/Ctrl + Shift + C -> Copy
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === 'c') {
        e.preventDefault();
        if (outputText || editor?.getText()) {
          copyToClipboard();
        }
      }

      // Cmd/Ctrl + Shift + X -> Clear Input
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === 'x') {
        e.preventDefault();
        setInputText("");
        originalTextRef.current = "";
        toast.info("Input cleared");
      }

      // Cmd/Ctrl + Shift + H -> Open History
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === 'h') {
        e.preventDefault();
        setIsHistoryOpen(true);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handlePolish, copyToClipboard, outputText, editor, setInputText]);

  return (
    <TooltipProvider>
      <div className="h-screen w-full flex flex-col bg-[#f8f9fa] font-sans text-slate-900">
      <Toaster position="top-center" />
      
      {/* Header */}
      <header className="h-14 border-b bg-white flex items-center px-6 justify-between shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-blue-600 text-white rounded-md flex items-center justify-center">
            <Wand2 size={18} />
          </div>
          <h1 className="text-lg font-medium text-slate-800 tracking-tight">AI Text Polisher</h1>
          <span className="ml-2 text-xs font-medium px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full">Studio</span>
        </div>
        <div className="flex items-center gap-4">
          <Sheet open={isHistoryOpen} onOpenChange={setIsHistoryOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="sm" className="text-slate-500 font-medium gap-2" title="View history (⌘/Ctrl + Shift + H)">
                <History size={16} />
                History
              </Button>
            </SheetTrigger>
            <SheetContent className="w-[400px] sm:w-[540px] flex flex-col p-6 font-sans">
              <SheetHeader>
                <SheetTitle className="flex items-center gap-2 text-slate-800">
                  <History size={20} className="text-blue-500" />
                  Run History
                </SheetTitle>
                <SheetDescription>
                  Review and revert to previously polished texts.
                </SheetDescription>
              </SheetHeader>
              <ScrollArea className="flex-1 mt-6 -mx-6 px-6">
                {history.length === 0 ? (
                  <div className="text-center text-slate-500 text-sm py-10">
                    No history yet. Start polishing some text!
                  </div>
                ) : (
                  <div className="space-y-4">
                    {history.map((item) => (
                      <div key={item.id} className="border rounded-lg p-4 bg-slate-50/50 hover:bg-slate-50 transition-colors">
                        <div className="flex items-center justify-between mb-3 text-xs text-slate-500">
                          <span className="flex items-center gap-1 font-medium">
                            <Clock size={12} />
                            {new Date(item.timestamp).toLocaleString()}
                          </span>
                          <div className="flex items-center gap-2 font-mono">
                            <span className="bg-white px-2 py-0.5 rounded border shadow-sm">{item.tone}</span>
                            <span className="bg-white px-2 py-0.5 rounded border shadow-sm">{item.language}</span>
                          </div>
                        </div>
                        <div className="text-sm font-medium text-slate-700 line-clamp-2 mb-2">
                          {item.inputText}
                        </div>
                        <div className="text-xs text-slate-500 line-clamp-2 mb-4 bg-white p-2 rounded border">
                          {item.outputText}
                        </div>
                        <Button 
                          variant="outline" 
                          size="sm" 
                          className="w-full text-xs shadow-sm bg-white hover:bg-slate-50"
                          onClick={() => revertToHistory(item)}
                        >
                          Revert to this version
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </ScrollArea>
            </SheetContent>
          </Sheet>
          <Button variant="ghost" size="sm" className="text-slate-500 font-medium">Docs</Button>
          <Button variant="ghost" size="sm" className="text-slate-500 font-medium">Share</Button>
          <div className="w-8 h-8 rounded-full bg-indigo-100 border border-indigo-200 flex items-center justify-center text-indigo-700 font-semibold text-sm">
            U
          </div>
        </div>
      </header>

      {/* Main Workspace */}
      <div className="flex flex-1 overflow-hidden">
        
        {/* Editor Area */}
        <div className="flex-1 flex flex-col p-4 md:p-6 overflow-hidden">
          <div className="w-full flex-1 flex flex-col lg:flex-row shadow-sm rounded-xl border bg-white overflow-hidden">
            
            {/* Input Section */}
            <div className="flex-1 flex flex-col border-b lg:border-b-0 lg:border-r">
              <div className="h-12 border-b bg-slate-50/50 flex items-center justify-between px-4">
                <span className="text-xs font-semibold text-slate-600 uppercase tracking-wider">Input</span>
                <div className="flex items-center gap-2">
                  {inputText && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-slate-400 hover:text-red-500"
                      onClick={() => setInputText("")}
                      title="Clear text (⌘/Ctrl + Shift + X)"
                    >
                      <Trash2 size={14} />
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="icon"
                    className={`h-7 w-7 ${isRecording ? 'text-red-500 hover:text-red-600 hover:bg-red-50' : 'text-slate-500'}`}
                    onClick={toggleRecording}
                    title={isRecording ? "Stop recording" : "Start recording"}
                  >
                    {isRecording ? <MicOff size={14} className="animate-pulse" /> : <Mic size={14} />}
                  </Button>
                  <span className="text-xs text-slate-400 font-mono">
                    {inputText.trim() ? inputText.trim().split(/\s+/).length : 0} words &bull; {inputText.length} chars
                  </span>
                </div>
              </div>
              <div className="relative flex-1 flex flex-col">
                <Textarea 
                  value={inputText}
                  onChange={(e) => {
                    setInputText(e.target.value);
                    setShowSynonyms(false);
                  }}
                  onMouseUp={handleSelection}
                  onKeyUp={handleSelection}
                  className="flex-1 resize-none border-0 shadow-none focus-visible:ring-0 p-4 md:p-6 text-[15px] leading-relaxed font-sans placeholder:text-slate-400 rounded-none bg-white" 
                  placeholder="Paste, type, or dictate the text you want to improve here..." 
                />
                
                {/* Auto Suggestions */}
                {showSuggestions && suggestions.length > 0 && !showSynonyms && (
                  <div className="absolute bottom-4 left-4 z-10 flex flex-wrap gap-2 animate-in fade-in slide-in-from-bottom-2 items-center">
                    {suggestions.length > 3 && (
                      <button 
                        onClick={() => setSuggestionIndex(Math.max(0, suggestionIndex - 3))}
                        disabled={suggestionIndex === 0}
                        className="bg-slate-800 text-slate-100 border border-slate-700 h-8 w-8 flex justify-center rounded-full shadow-md hover:bg-slate-700 transition-colors items-center focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <ChevronLeft size={16} />
                      </button>
                    )}
                    {suggestions.slice(suggestionIndex, suggestionIndex + 3).map((suggestion, i) => (
                      <button 
                        key={suggestionIndex + i}
                        onClick={() => {
                          const newText = inputText + (inputText.endsWith(' ') ? '' : ' ') + suggestion;
                          setInputText(newText);
                          setShowSuggestions(false);
                          setSuggestions([]);
                        }}
                        className="bg-slate-800 text-slate-100 border border-slate-700 text-sm px-3 py-1.5 rounded-full shadow-md hover:bg-slate-700 transition-colors flex items-center gap-1.5 font-medium"
                      >
                        <Sparkles size={12} className="text-blue-400 shrink-0" />
                        <span className="truncate max-w-[200px]">{suggestion}</span>
                      </button>
                    ))}
                    {suggestions.length > 3 && (
                      <button 
                        onClick={() => setSuggestionIndex(Math.min(suggestions.length - 3, suggestionIndex + 3))}
                        disabled={suggestionIndex >= suggestions.length - 3}
                        className="bg-slate-800 text-slate-100 border border-slate-700 h-8 w-8 flex justify-center rounded-full shadow-md hover:bg-slate-700 transition-colors items-center focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <ChevronRight size={16} />
                      </button>
                    )}
                  </div>
                )}

                {/* Synonyms */}
                {showSynonyms && (
                  <div className="absolute top-4 right-4 z-20 flex flex-col gap-2 max-w-[250px] animate-in fade-in slide-in-from-top-2 bg-white border shadow-lg rounded-xl p-3">
                    <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">
                      Synonyms for "{selectedWordRange?.text}"
                    </span>
                    {isFetchingSynonyms ? (
                      <div className="flex items-center gap-2 text-slate-500 text-sm py-2">
                        <Loader2 size={14} className="animate-spin text-blue-500" /> Finding synonyms...
                      </div>
                    ) : synonyms.length > 0 ? (
                      <div className="flex flex-wrap gap-1.5">
                        {synonyms.map((synonym, i) => (
                          <button 
                            key={i}
                            onClick={() => {
                              if (selectedWordRange) {
                                const before = inputText.substring(0, selectedWordRange.start);
                                const after = inputText.substring(selectedWordRange.end);
                                // The new start/end might be tricky due to trimming in select, we should just use substring substitution based on exact range.
                                setInputText(before + synonym + after);
                                setShowSynonyms(false);
                                setSynonyms([]);
                              }
                            }}
                            className="bg-blue-50 text-blue-700 border border-blue-200 text-xs px-2.5 py-1 rounded-md hover:bg-blue-100 transition-colors flex items-center gap-1 font-medium"
                          >
                            {synonym}
                          </button>
                        ))}
                      </div>
                    ) : (
                      <div className="text-xs text-slate-500 italic py-1">No synonyms found.</div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Output Section */}
            <div className="flex-1 flex flex-col bg-slate-50/30 relative">
              <div className="h-12 border-b bg-slate-50/50 flex items-center justify-between px-4">
                <span className="text-xs font-semibold text-slate-600 uppercase tracking-wider flex items-center gap-2">
                  <Sparkles size={14} className="text-blue-500" />
                  Polished Output
                </span>
                <div className="flex items-center gap-2">
                  {outputText && (
                    <>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-slate-500" onClick={copyToClipboard} title="Copy to clipboard (⌘/Ctrl + Shift + C)">
                        {isCopied ? <Check size={14} /> : <Copy size={14} />}
                      </Button>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-slate-500" title="Export file">
                            <Download size={14} />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={downloadTxt} className="flex items-center gap-2 cursor-pointer">
                            <FileText size={14} className="text-slate-500" /> Export as .txt
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={downloadDocx} className="flex items-center gap-2 cursor-pointer">
                            <File size={14} className="text-slate-500" /> Export as .docx
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={downloadPdf} className="flex items-center gap-2 cursor-pointer">
                            <File size={14} className="text-slate-500" /> Export as .pdf
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </>
                  )}
                  <Button variant="ghost" size="icon" className="h-7 w-7 text-slate-500 hidden md:flex" title="Fullscreen">
                    <Maximize2 size={14} />
                  </Button>
                  <span className="text-xs text-slate-400 font-mono">
                    {editor ? editor.getText().length : (outputText ? outputText.length : 0)} chars
                  </span>
                </div>
              </div>
              <div className="flex-1 p-4 md:p-6 overflow-hidden flex flex-col">
                {isLoading ? (
                  <div className="h-full flex flex-col items-center justify-center text-slate-400 space-y-4">
                    <Loader2 size={24} className="animate-spin text-blue-500" />
                    <p className="text-sm">Polishing your text...</p>
                  </div>
                ) : outputText ? (
                  <div className="flex-1 flex flex-col min-h-0">
                    {editor && (
                      <div className="flex items-center gap-1 mb-3 pb-3 border-b shrink-0">
                        <Button
                          variant="ghost"
                          size="icon"
                          className={`h-8 w-8 ${editor.isActive('bold') ? 'bg-slate-200' : ''}`}
                          onClick={() => editor.chain().focus().toggleBold().run()}
                          title="Bold"
                        >
                          <Bold size={14} />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className={`h-8 w-8 ${editor.isActive('italic') ? 'bg-slate-200' : ''}`}
                          onClick={() => editor.chain().focus().toggleItalic().run()}
                          title="Italic"
                        >
                          <Italic size={14} />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className={`h-8 w-8 ${editor.isActive('underline') ? 'bg-slate-200' : ''}`}
                          onClick={() => editor.chain().focus().toggleUnderline().run()}
                          title="Underline"
                        >
                          <UnderlineIcon size={14} />
                        </Button>
                        <div className="w-px h-4 bg-slate-200 mx-1" />
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => editor.chain().focus().undo().run()}
                          disabled={!editor.can().undo()}
                          title="Undo"
                        >
                          <Undo size={14} />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => editor.chain().focus().redo().run()}
                          disabled={!editor.can().redo()}
                          title="Redo"
                        >
                          <Redo size={14} />
                        </Button>
                      </div>
                    )}
                    <div className="flex-1 overflow-auto">
                      <EditorContent editor={editor} className="prose prose-slate prose-sm md:prose-base max-w-none prose-p:leading-relaxed text-[15px] h-full" />
                    </div>
                  </div>
                ) : (
                  <div className="h-full flex items-center justify-center text-slate-400 text-sm">
                    Your polished text will appear here.
                  </div>
                )}
              </div>
            </div>

          </div>
        </div>

        {/* Right Sidebar */}
        <aside className="w-80 border-l bg-white flex flex-col shrink-0 overflow-y-auto">
          <div className="h-14 border-b flex items-center px-5 gap-2 text-sm font-semibold text-slate-800">
            <Settings size={18} className="text-slate-500" /> 
            Run settings
          </div>
          
          <div className="flex-1 p-5 space-y-6">
            
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Tone</Label>
              </div>
              <Select value={tone} onValueChange={setTone}>
                <SelectTrigger className="bg-slate-50">
                  <SelectValue placeholder="Select a tone" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Professional">
                    <Tooltip delayDuration={200}>
                      <TooltipTrigger asChild>
                        <span className="w-full flex">Professional <span className="text-slate-400 font-normal text-xs ml-1">(Business)</span></span>
                      </TooltipTrigger>
                      <TooltipContent side="left" className="max-w-[200px] text-xs">
                        <p>Clear, crisp, and authoritative. Projects competence and reliability for workplace communication.</p>
                      </TooltipContent>
                    </Tooltip>
                  </SelectItem>
                  <SelectItem value="Casual">
                    <Tooltip delayDuration={200}>
                      <TooltipTrigger asChild>
                        <span className="w-full flex">Casual <span className="text-slate-400 font-normal text-xs ml-1">(Friendly)</span></span>
                      </TooltipTrigger>
                      <TooltipContent side="left" className="max-w-[200px] text-xs">
                        <p>Warm, relaxed, and conversational. Like chatting with a friend over coffee.</p>
                      </TooltipContent>
                    </Tooltip>
                  </SelectItem>
                  <SelectItem value="Academic">
                    <Tooltip delayDuration={200}>
                      <TooltipTrigger asChild>
                        <span className="w-full flex">Academic <span className="text-slate-400 font-normal text-xs ml-1">(Formal)</span></span>
                      </TooltipTrigger>
                      <TooltipContent side="left" className="max-w-[200px] text-xs">
                        <p>Rigorous, objective, and scholarly. Employs sophisticated vocabulary and structured arguments.</p>
                      </TooltipContent>
                    </Tooltip>
                  </SelectItem>
                  <SelectItem value="Persuasive">
                    <Tooltip delayDuration={200}>
                      <TooltipTrigger asChild>
                        <span className="w-full flex">Persuasive <span className="text-slate-400 font-normal text-xs ml-1">(Marketing)</span></span>
                      </TooltipTrigger>
                      <TooltipContent side="left" className="max-w-[200px] text-xs">
                        <p>Compelling and action-oriented. Designed to captivate your audience and drive them to say "yes".</p>
                      </TooltipContent>
                    </Tooltip>
                  </SelectItem>
                  <SelectItem value="Empathetic">
                    <Tooltip delayDuration={200}>
                      <TooltipTrigger asChild>
                        <span className="w-full flex">Empathetic <span className="text-slate-400 font-normal text-xs ml-1">(Support)</span></span>
                      </TooltipTrigger>
                      <TooltipContent side="left" className="max-w-[200px] text-xs">
                        <p>Compassionate, understanding, and supportive. Ideal for navigating sensitive topics with care.</p>
                      </TooltipContent>
                    </Tooltip>
                  </SelectItem>
                  <SelectItem value="Creative">
                    <Tooltip delayDuration={200}>
                      <TooltipTrigger asChild>
                        <span className="w-full flex">Creative <span className="text-slate-400 font-normal text-xs ml-1">(Storytelling)</span></span>
                      </TooltipTrigger>
                      <TooltipContent side="left" className="max-w-[200px] text-xs">
                        <p>Imaginative, vivid, and colorful. Weaves a narrative that engages the senses and sparks curiosity.</p>
                      </TooltipContent>
                    </Tooltip>
                  </SelectItem>
                  <SelectItem value="Formal">
                    <Tooltip delayDuration={200}>
                      <TooltipTrigger asChild>
                        <span className="w-full flex">Formal <span className="text-slate-400 font-normal text-xs ml-1">(Polite)</span></span>
                      </TooltipTrigger>
                      <TooltipContent side="left" className="max-w-[200px] text-xs">
                        <p>Polite, structured, and respectful. Adheres to traditional etiquette for official correspondence.</p>
                      </TooltipContent>
                    </Tooltip>
                  </SelectItem>
                  <SelectItem value="Informal">
                    <Tooltip delayDuration={200}>
                      <TooltipTrigger asChild>
                        <span className="w-full flex">Informal <span className="text-slate-400 font-normal text-xs ml-1">(Everyday)</span></span>
                      </TooltipTrigger>
                      <TooltipContent side="left" className="max-w-[200px] text-xs">
                        <p>Breezy and natural. Perfect for quick notes, everyday updates, and laid-back interactions.</p>
                      </TooltipContent>
                    </Tooltip>
                  </SelectItem>
                  <SelectItem value="Humorous">
                    <Tooltip delayDuration={200}>
                      <TooltipTrigger asChild>
                        <span className="w-full flex">Humorous <span className="text-slate-400 font-normal text-xs ml-1">(Funny)</span></span>
                      </TooltipTrigger>
                      <TooltipContent side="left" className="max-w-[200px] text-xs">
                        <p>Witty, playful, and lighthearted. Injects charm and amusement to bring a smile to your reader.</p>
                      </TooltipContent>
                    </Tooltip>
                  </SelectItem>
                  <SelectItem value="Technical">
                    <Tooltip delayDuration={200}>
                      <TooltipTrigger asChild>
                        <span className="w-full flex">Technical <span className="text-slate-400 font-normal text-xs ml-1">(Expert)</span></span>
                      </TooltipTrigger>
                      <TooltipContent side="left" className="max-w-[200px] text-xs">
                        <p>Precise, analytical, and detailed. Uses exact terminology for documentation and expert peers.</p>
                      </TooltipContent>
                    </Tooltip>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            <Separator />

            <div className="space-y-3">
              <Label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Length</Label>
              <Select value={length} onValueChange={setLength}>
                <SelectTrigger className="bg-slate-50">
                  <SelectValue placeholder="Select length constraint" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Same Length">Preserve Original Length</SelectItem>
                  <SelectItem value="Shorter">Make it More Concise</SelectItem>
                  <SelectItem value="Longer">Expand & Elaborate</SelectItem>
                  <SelectItem value="Summarize">Summarize (Bullet points)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <Separator />

            <div className="space-y-3">
              <Label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Language</Label>
              <Select value={language} onValueChange={setLanguage}>
                <SelectTrigger className="bg-slate-50">
                  <SelectValue placeholder="Language" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="English">English</SelectItem>
                  <SelectItem value="Spanish">Spanish (Español)</SelectItem>
                  <SelectItem value="French">French (Français)</SelectItem>
                  <SelectItem value="German">German (Deutsch)</SelectItem>
                  <SelectItem value="Polish">Polish (Polski)</SelectItem>
                  <SelectItem value="Japanese">Japanese (日本語)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="pt-6">
              <Button 
                onClick={handlePolish} 
                disabled={isLoading || !inputText.trim()}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white shadow-sm h-10 gap-2 font-medium"
                title="Polish text (⌘/Ctrl + Enter)"
              >
                {isLoading ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
                {isLoading ? "Running..." : "Polish"}
              </Button>
              <p className="text-center text-[11px] text-slate-400 mt-3 font-medium">
                Powered by Gemini 3.1 Pro
              </p>
            </div>
          </div>
        </aside>

      </div>
      </div>
    </TooltipProvider>
  );
}
