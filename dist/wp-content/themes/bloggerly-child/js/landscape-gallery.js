(function () {
    'use strict';
    window.BeesayaLandscapeGallery = {
        create: function (photos) {
            var root = document.createElement('div');
            root.className = 'beesaya-landscape-gallery';
            var image = document.createElement('img');
            image.alt = 'Landscape observation'; image.loading = 'lazy'; image.decoding = 'async';
            image.addEventListener('load',function(){
                var scale=Math.min(220/image.naturalWidth,180/image.naturalHeight,1);
                root.style.width=Math.max(120,Math.round(image.naturalWidth*scale))+'px';
            });
            var nav = document.createElement('div'); nav.className = 'beesaya-landscape-gallery__nav';
            function button(label, action) { var b = document.createElement('button'); b.type = 'button'; b.textContent = label; b.addEventListener('click', action); return b; }
            var index = 0;
            var count = document.createElement('span'); count.setAttribute('aria-live','polite');
            var prev = button('\u2039', function () { index--; update(); }); prev.setAttribute('aria-label','Previous photo');
            var next = button('\u203a', function () { index++; update(); }); next.setAttribute('aria-label','Next photo');
            function update() { image.src = photos[index]; count.textContent = (index + 1) + ' of ' + photos.length; prev.disabled = index === 0; next.disabled = index === photos.length - 1; }
            function openFull() {
                var dialog = document.createElement('dialog'); dialog.className = 'beesaya-landscape-full'; dialog.setAttribute('aria-label','Landscape photo viewer');
                var full = document.createElement('img'); full.alt = image.alt; full.src = photos[index];
                var fullNav = document.createElement('div'); fullNav.className = 'beesaya-landscape-gallery__nav';
                var label = document.createElement('span');
                function refresh() { full.src = photos[index]; label.textContent = (index+1)+' of '+photos.length; back.disabled = index===0; forward.disabled = index===photos.length-1; update(); }
                var back = button('\u2039',function(){index--;refresh();}); back.setAttribute('aria-label','Previous photo');
                var forward = button('\u203a',function(){index++;refresh();}); forward.setAttribute('aria-label','Next photo');
                var close = button('\u00d7',function(){dialog.close();}); close.setAttribute('aria-label','Close photo viewer');
                dialog.addEventListener('close',function(){dialog.remove();expand.focus();});
                close.className='beesaya-landscape-full__close';
                fullNav.append(back,label,forward); dialog.append(close,full,fullNav); document.body.appendChild(dialog); refresh(); dialog.showModal(); close.focus();
                if(photos.length===1) fullNav.hidden=true;
                var startX;
                full.addEventListener('touchstart',function(e){startX=e.changedTouches[0].clientX;},{passive:true});
                full.addEventListener('touchend',function(e){var delta=e.changedTouches[0].clientX-startX;if(Math.abs(delta)>50){index=Math.max(0,Math.min(photos.length-1,index+(delta<0?1:-1)));refresh();}},{passive:true});
            }
            var expand = button('\u2922',openFull); expand.className='beesaya-landscape-gallery__expand'; expand.setAttribute('aria-label','Enlarge photo');
            var photoButton=button('',function(){if(swiped){swiped=false;return;}openFull();});
            photoButton.className='beesaya-landscape-gallery__photo'; photoButton.setAttribute('aria-label','Expand photo'); photoButton.appendChild(image);
            var startX, startY, swiped=false;
            photoButton.addEventListener('touchstart',function(e){startX=e.changedTouches[0].clientX;startY=e.changedTouches[0].clientY;swiped=false;},{passive:true});
            photoButton.addEventListener('touchend',function(e){var dx=e.changedTouches[0].clientX-startX,dy=e.changedTouches[0].clientY-startY;if(Math.abs(dx)>40 && Math.abs(dx)>Math.abs(dy)){swiped=true;index=Math.max(0,Math.min(photos.length-1,index+(dx<0?1:-1)));update();}},{passive:true});
            nav.append(prev,count,next); root.append(photoButton,expand,nav); update();
            if (photos.length === 1) nav.hidden = true;
            return root;
        }
    };
})();
