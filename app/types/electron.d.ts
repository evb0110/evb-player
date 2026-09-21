import type {ICourseShelfApi} from '../../shared/types';

declare global {
  interface Window {
    courseShelf: ICourseShelfApi;
  }
}

export {};
