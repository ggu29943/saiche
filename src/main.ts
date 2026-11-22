import './ui/styles.css';
import { strings } from './ui/strings';

const title = document.createElement('h1');
title.textContent = strings.title;
title.style.cssText = 'position:absolute;inset:0;display:grid;place-items:center;margin:0';
document.querySelector('#ui')!.append(title);
