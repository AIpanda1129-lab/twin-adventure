// The comparison page always opens each real phone viewport at its beginning.
for(const frame of document.querySelectorAll('iframe')){
 frame.addEventListener('load',()=>{frame.contentWindow.scrollTo(0,0)});
}
window.addEventListener('load',()=>{requestAnimationFrame(()=>{for(const frame of document.querySelectorAll('iframe'))frame.contentWindow.scrollTo(0,0);window.scrollTo(0,0)})});
