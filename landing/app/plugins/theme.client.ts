import {useTheme} from '../composables/useTheme';

export default defineNuxtPlugin(() => {
  const {explicitTheme, followSystem, chooseTheme} = useTheme();
  const media = window.matchMedia('(prefers-color-scheme: dark)');

  if (explicitTheme.value) {
    chooseTheme(explicitTheme.value);
  } else {
    followSystem(media.matches ? 'dark' : 'light');
  }

  media.addEventListener('change', (event) => {
    if (!explicitTheme.value) {
      followSystem(event.matches ? 'dark' : 'light');
    }
  });
});
