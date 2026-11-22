import type { DetailedHTMLProps, HTMLAttributes } from 'react';

// Zapier Interfaces chatbot web component, loaded from the root layout.
type ZapierChatbotEmbedProps = DetailedHTMLProps<HTMLAttributes<HTMLElement>, HTMLElement> & {
  'chatbot-id': string;
  'is-popup'?: 'true' | 'false';
};

declare module 'react' {
  namespace JSX {
    interface IntrinsicElements {
      'zapier-interfaces-chatbot-embed': ZapierChatbotEmbedProps;
    }
  }
}
