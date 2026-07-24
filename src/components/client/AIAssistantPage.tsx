import AssistantChat from '../common/AssistantChat';

/**
 * Page dédiée de l'assistant IA (/client/ai-assistant). L'accès courant se fait
 * par la bulle 🤖 flottante présente sur toutes les interfaces (AssistantWidget) ;
 * cette page en reste la version plein écran, joignable par URL.
 */
export default function AIAssistantPage() {
  return <AssistantChat variant="page" />;
}
