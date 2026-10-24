// The Salvage Yard design system's CSS, in its cascade order: tokens, fonts, the class library.
// Imported once by the app (main.tsx) and by Storybook (.storybook/preview.tsx). The files are a
// copy of the design package (`pnpm ds:sync`); never edit them here.
import './assets/css/tokens.css';
import './assets/css/fonts.css';
import './assets/css/salvage.css';
// The generative UI's parts (the Workbench, the assistant's cards): on top of the library.
import './assets/css/genui.css';
// Ours (spec 076): the token utilities (generated from tokens.css), in the designer's sy.utilities
// layer. A component class of our own goes in styles/ too, in sy.components, on role tokens only.
import './styles/utilities.css';
