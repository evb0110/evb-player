import type {IPlayerApi} from '../../shared/types';

declare global {
  interface Window {
    evbPlayer?: IPlayerApi;
  }
}

export {};
