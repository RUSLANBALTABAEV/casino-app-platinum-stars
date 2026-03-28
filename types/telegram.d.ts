export interface TelegramBackButton {
  isVisible: boolean;
  show: () => void;
  hide: () => void;
  onClick: (callback: () => void) => void;
  offClick?: (callback: () => void) => void;
}

export interface TelegramUser {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  language_code?: string;
  is_premium?: boolean;
  photo_url?: string;
}

export interface TelegramInitData {
  query_id?: string;
  user?: TelegramUser;
  receiver?: TelegramUser;
  start_param?: string;
  auth_date?: number;
  hash: string;
}

export interface TelegramThemeParams {
  accent_text_color?: string;
  bg_color?: string;
  button_color?: string;
  button_text_color?: string;
  destructive_text_color?: string;
  header_bg_color?: string;
  hint_color?: string;
  link_color?: string;
  secondary_bg_color?: string;
  section_bg_color?: string;
  section_header_text_color?: string;
  subtitle_text_color?: string;
  text_color?: string;
}

export interface TelegramWebApp {
  colorScheme?: 'light' | 'dark';
  isExpanded?: boolean;
  initData?: string;
  initDataUnsafe?: TelegramInitData;
  themeParams?: TelegramThemeParams;
  viewportStableHeight?: number;
  ready: () => void;
  expand: () => void;
  disableVerticalSwipes?: () => void;
  disableDrag?: () => void;
  onEvent?: (event: string, handler: () => void) => void;
  offEvent?: (event: string, handler: () => void) => void;
  BackButton: TelegramBackButton;
  openTelegramLink: (url: string) => void;
  openInvoice: (url: string, callback?: (status: string) => void) => void;
}

interface TelegramNamespace {
  WebApp: TelegramWebApp;
}

declare global {
  interface Window {
    Telegram?: TelegramNamespace;
  }
}

export {};
