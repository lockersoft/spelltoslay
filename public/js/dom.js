// Elements more than one module needs.
export const canvas = document.getElementById('arena');
export const ctx = canvas.getContext('2d');
ctx.textAlign = 'center';
ctx.textBaseline = 'middle';

export const typeInput = document.getElementById('type-input');
export const wordSizeSlider = document.getElementById('word-size-slider');
