// ==UserScript==
// @name         SteamGifts: NSFW games filter
// @description  NSFW games filter for SteamGifts.
// @author       Xeloses
// @version      0.0.1.1
// @copyright    Copyright (C) 2023, by Xeloses
// @license      GPL-3.0 (https://www.gnu.org/licenses/gpl-3.0.html)
// @namespace    Xeloses.SG.NSFWFilter
// @website      https://github.com/Xeloses/sg-nsfw-filter/
// @source       https://github.com/Xeloses/sg-nsfw-filter/
// @downloadURL  https://raw.githubusercontent.com/Xeloses/sg-nsfw-filter/master/sg-nsfw-filter.user.js
// @updateURL    https://raw.githubusercontent.com/Xeloses/sg-nsfw-filter/master/sg-nsfw-filter.user.js
// @icon         https://www.google.com/s2/favicons?sz=32&domain=steamgifts.com
// @icon64       https://www.google.com/s2/favicons?sz=64&domain=steamgifts.com
// @match        https://steamgifts.com/*
// @match        https://www.steamgifts.com/*
// @grant        GM.xmlHttpRequest
// @grant        GM_xmlhttpRequest
// @grant        GM_getValue
// @grant        GM_setValue
// @connect      store.steampowered.com
// @noframes
// @run-at       document-end
// ==/UserScript==

(function() {
    'use strict';

    /*
     * @var Page URL.
     */
    let url = new URL(location.href);
    if(!url.hostname.endsWith('steamgifts.com')) return;

    /*
     * @const Block list (by Developer, Publisher and game content descriptors).
     */
    const Blocklist = {
        developers: [],
        publishers: [],
        content_descriptors: [1,3,4]
    };

    /*
     * @const SteamGifts pages to be processed by script with CSS selectors for those pages.
     */
    const SG = {
        /* Pages matching full address (without domain) */
        Pages: {
            '/': '.giveaway__row-outer-wrap', // SG homepage
            '/giveaways': '.giveaway__row-outer-wrap', // SG homepage
            '/giveaways/search': '.giveaway__row-outer-wrap', // Giveaways search
            '/search/giveaways': '.giveaway__row-outer-wrap'  // Giveaways search
        },
        /* Pages matching beginning part of address (without domain) */
        PagesMask: {
            '/giveaway/': '.featured__outer-wrap' // Giveaway page
        },
        /* Pages matching address by RegExp (without domain) */
        PagesRegex: {
            '^\\/user\\/[^\\/]+$': '.giveaway__row-outer-wrap', // User' giveaways
            '^\\/group\\/[\\w]{5}\\/[^\\/]+$': '.giveaway__row-outer-wrap' // Group' giveaways
        }
    };

    /*
     * @const URLs & WebAPI endpoint templatess.
     */
    const URLs = {
        API: {
            Steam: {
                Game: 'https://store.steampowered.com/api/appdetails?appids={%appid%}',
                Package: 'https://store.steampowered.com/api/packagedetails?packageids={%appid%}'
            }
        }
    }

    /*
     * @const Userscript Storage ID.
     */
    const STORAGE_ID = 'NSFWGames';

    /*
     * @var Requests counter.
     */
    let count_requests = 0;

    /*
     * @const Filter elements.
     */
    const Filter = {
        nsfw: {
            id: 'xnsfw_filter',
            param: 'XelFilter:nsfw',
            param_values: {
                on:  ['no','hide','off'],
                off: ['yes','show','on']
            },
            type: 'checkbox',
            element: null,
            default: false, // default value
            enabled: false  // initial state
        }
    };

    /*
     * @const NSFW games counter.
     */
    const nsfw_counter = {
        id: 'xnsfw_filter_counter',
        element: null,
        count: 0
    }

    /*
     * @class     XelLog
     * @classdesc Console API wrapper.
     *
     * @property {String} app
     * @property {String} version
     * @property {String} ns
     * @property {String} author
     * @method log({String} message)
     * @method info({String} message)
     * @method warn({String} message)
     * @method error({String} message)
     */
    class XelLog{constructor(){let d=GM_info.script;this.author=d.author;this.app=d.name;this.ns=d.namespace;this.version=d.version;this.h='color:#c5c;font-weight:bold;';this.t='color:#ddd;font-weight:normal;';}log(s){console.log('%c['+this.app+']%c '+s,this.h,this.t)}info(s){console.info('%c['+this.app+']%c '+s,this.h,this.t+'font-style:italic;')}warn(s){console.warn('%c['+this.app+']%c '+s,this.h,this.t)}error(s){console.error('%c['+this.app+']%c '+s,this.h,this.t)}}
    const LOG = new XelLog();

    /*
     * @class     XelUserscriptStorage
     * @classdesc Userscript storage API wrapper.
     *
     * @method has({String} name)
     * @method get({String} name)
     * @method add({String} name, {Mixed} value)
     * @method set({String} name, {Mixed} value)
     * @method empty()
     * @method clear()
     * @method load()
     * @method save()
     * @method on({String} event, {Function} callback)
     */
    class XelUserscriptStorage
    {
        constructor(name){ if(!name || !name.trim().length) throw new Error('XelUserscriptStorage error: could not create object instance with empty "name".'); this.name = name.trim(); this._e = {}; this._d = null; this.load(); }
        load(){ try{ let data = JSON.parse(GM_getValue(this.name, [])); this._d = new Map( data ? data : [] ); }catch(e){ this._d = new Map(); } this._trigger('load'); return this; }
        save(){ if(this._d) GM_setValue(this.name, JSON.stringify(Array.from(this._d))); this._trigger('save'); return this; }
        has(name){ return this._d.has(name); }
        get(name){ return this._d.has(name) ? this._d.get(name) : null; }
        add(name,value){ return this.set(name,value); }
        set(name,value){ this._d.set(name,value); return this; }
        clear(){ this._d = new Map(); return this.save(); }
        count(){ return (this._d) ? this._d.size : 0; }
        empty(){ return this.count() > 0; }
        on(name, callback){ if(!this._e[name]) this._e[name] = []; this._e[name].push(callback); return this; }
        _trigger(name, data){ if(!this._e[name] || !this._e[name].length) return;this._e[name].forEach(callback => callback(data));return this; }
    }

    /*
     * @const Cache
     */
    const CACHE = new XelUserscriptStorage(STORAGE_ID);
    CACHE.NSFW = CACHE.get('nsfw') || [];
    CACHE.SFW = CACHE.get('sfw') || [];
    CACHE.updated = false;

    /**
     * Fetch implementation for Usescripts.
     */
    function _fetch(url, options = null){ const defaults = { method: 'GET', response_type: 'json', anonymous: true, nocache: true, console_errors: false }, $xhr = (typeof GM.xmlhttpRequest !== 'undefined') ? GM.xmlhttpRequest : GM_xmlhttpRequest; options = options ? {...defaults, ...options} : defaults; return new Promise((resolve,reject) => { $xhr({ method: options.method, url: url, anonymous: options.anonymous, nocache: options.nocache, responseType: options.response_type, onload:function(response){ if(response.status && response.status == 200) { if(response.response && response.response.length) resolve(response.response); else if(response.responseText && response.responseText.length){ if(options.response_type == 'json') try{ resolve(JSON.parse(response.responseText)); }catch(err){ reject(err); }else resolve(response.responseText); }else reject(new Error(response.statusText));}else reject(new Error((response.status ? response.status + ' ' : '') + response.statusText)); }, onerror:function(response){ reject(new Error((response.status ? response.status + ' ' : '') + response.statusText)); }})}).catch(err => { if(options.console_errors) console.error('[Error] Fetch failed on "' + url + "\".\n" + err.message); }); }

    /**
     * Sleep (delay) implementation.
     */
    async function _sleep(t){ return new Promise(f => setTimeout(f, t+1)); }

    /**
     * Wait for page loading/processing.
     *
     * @param  {String}  sel  CSS selector of element to wait for
     * @return {Promise}      empty Promise
     */
    async function waitPageLoading(sel)
    {
        while(true)
        {
            if(document.querySelector(sel)) break;
            await _sleep(330);
        }
    }

    /**
     * Inject CSS.
     *
     * @return {Void}
     */
    function injectCSS()
    {
        const id = LOG.ns.toLowerCase().replace('.','-');

        if(document.getElementById(id)) return;

        const css = `#xnsfw_filter_form dl {width: 100%; padding: 6px 10px;}
                     #xnsfw_filter_form dt {display: inline-block; width: 75%; text-align: left;}
                     #xnsfw_filter_form dd {display: inline-block; width: 20%; text-align: right;}
                     #xnsfw_filter_form input {width: auto;}
                     #xnsfw_filter_form input[type=checkbox]:enabled,  #xnsfw_filter_form label          {cursor: pointer;}
                     #xnsfw_filter_form input[type=checkbox]:disabled, #xnsfw_filter_form label.inactive {cursor: not-allowed; filter: opacity(.5);}
                     #xnsfw_filter_form label {caret-color: transparent;}
                     #xnsfw_filter_form label .fa          {display: none; margin: 0 5px;}
                     #xnsfw_filter_form label.inactive .fa {display: inline-block;}
                     #xnsfw_filter_counter {font-style: italic; filter: opacity(.5);} `;

        const el = document.createElement('STYLE');
        el.type = 'text/css';
        el.id = id;
        el.innerText = css.replace(/[\s]{2,}/g,' ');
        document.head.appendChild(el);
    }

    /**
     * Store game in the cache.
     *
     * @param  {String}   id    AppID of the game
     * @param  {Boolean}  id    Indicates NSFW game
     * @return {Object}
     */
    function _cache(id, isNSFW = false)
    {
        if(isNSFW)
        {
            CACHE.NSFW.push(id);
            CACHE.set('nsfw', CACHE.NSFW);
        }
        else
        {
            CACHE.SFW.push(id);
            CACHE.set('sfw', CACHE.SFW);
        }

        if(!CACHE.updated) CACHE.updated = true;
    }

    /**
     * Filter giveaways.
     *
     * @return {Void}
     */
    function applyFilter()
    {
        const val = Filter.nsfw.element.checked;

        try
        {
            localStorage.setItem(Filter.nsfw.param, val);
        }
        catch(e){}

        if(nsfw_counter.count)
        {
            const GAs = document.getElementsByClassName('giveaway__row-outer-wrap');

            for(let ga of GAs)
                ga.style.display = (val && ga.dataset.nsfw == 'yes') ? 'none' : 'block';
        }
    }

    /**
     * Initialize values for filter element (using data from LocalStorage and URL params).
     *
     * @return {Void}
     */
    function initFilter()
    {
        try
        {
            let val = localStorage.getItem(Filter.nsfw.param);

            if(val !== null)
                Filter.nsfw.element.checked = val;
        }
        catch(e)
        {
            if(e instanceof window.SecurityError)
                LOG.warn(`Local storage is not available or disabled (Error[${e.code}]: ${e.message}).`);
            else
                LOG.warn(`Unable to gain access to local storage (Error[${e.code}]: ${e.message}).`);
        }
    }

    /**
     * Render filter form.
     *
     * @return {Void}
     */
    function renderFilterForm()
    {
        let caption = 'NSFW Games',
            html = `<form action="javascript:return false;" id="xnsfw_filter_form">
                       <dl>
                           <dt><label for="${Filter.nsfw.id}" ${Filter.nsfw.enabled ? '' : 'class="inactive"'}>Hide NSFW games <span id="${nsfw_counter.id}">(loading...)</span><i class="fa fa-spinner fa-pulse"></i></label></dt>
                           <dd><input id="${Filter.nsfw.id}" type="${Filter.nsfw.type}" ${Filter.nsfw.default ? 'checked' : ''} ${Filter.nsfw.enabled ? '' : 'disabled'} /></dd>
                       </dl>
                   </form>`;

        let container = document.querySelector('.sidebar'),
            el = null;

        el = document.createElement('DIV');
        el.classList.add('sidebar__heading');
        el.innerText = caption;
        container.appendChild(el);

        el = document.createElement('DIV');
        el.classList.add('sidebar__navigation');
        el.innerHTML = html;
        container.appendChild(el);

        Filter.nsfw.element = document.getElementById(Filter.nsfw.id);
        nsfw_counter.element = document.getElementById(nsfw_counter.id);

        Filter.nsfw.element.addEventListener('change', applyFilter);
        el.querySelector('label').addEventListener('focus', function(){ document.getElementById(this.htmlFor).focus(); });

        initFilter();
    }

    /**
     * Get game info from Steam WebAPI.
     *
     * @param  {String}  id  AppID of the game
     * @return {Promise}
     */
    async function loadGameInfo(id)
    {
        await _sleep(330); // wait 330ms (0.33s) to prevent spamming requests

        const data = await _fetch(URLs.API.Steam.Game.replace('{%appid%}', id));
        count_requests++;

        if(data && data[id] && data[id].success)
        {
            let i = 0;

            if(Blocklist.developers.length)
                for(i = 0; i < data[id].data.developers.length; i++)
                    if(Blocklist.developers.includes(data[id].data.developers[i]))
                        return true;

            if(Blocklist.publishers.length)
                for(i = 0; i < data[id].data.publishers.length; i++)
                    if(Blocklist.publishers.includes(data[id].data.publishers[i]))
                        return true;

            if(Blocklist.content_descriptors.length)
                for(i = 0; i < data[id].data.content_descriptors.ids.length; i++)
                    if(Blocklist.content_descriptors.includes(data[id].data.content_descriptors.ids[i]))
                        return true;
        }

        return false;
    }

    /**
     * Get package info from Steam WebAPI.
     *
     * @param  {String}  id  SubID of the package
     * @return {Promise}
     */
    async function loadPackageInfo(id)
    {
        await _sleep(330); // wait 330ms (0.33s) to prevent spamming requests

        const data = await _fetch(URLs.API.Steam.Package.replace('{%appid%}', id));
        count_requests++;

        if(data && data[id] && data[id].success && data[id].data.apps.length)
        {
            const ids = data[id].data.apps.map(item => item.id),
                  gid = Math.min(...ids); // get lowest AppID in package -> it should be base game

            return await loadGameInfo(gid);
        }

        return false;
    }

    /**
     * Process single game.
     *
     * @param  {DomElement} el
     * @return {Promise}
     */
    async function processGame(el)
    {
        const a = el.querySelector('a[href^="https://store.steampowered.com/"], a[href^="http://store.steampowered.com/"], a[style*="akamaihd.net/steam/apps/"]');
        if(!a) return;

        let [_, species, id] = (a.href.includes('/giveaway/') ? a.style.backgroundImage : a.href).match(/\/(apps?|subs?|bundle)\/([\d]+)/i),
            isNSFW = false;
        species = species.substr(0,3);

        if(CACHE.NSFW.includes(id))
            isNSFW = true;
        else if(CACHE.SFW.includes(id))
            isNSFW = false;
        else
        {
            isNSFW = ( species == 'app' ? await loadGameInfo(id) : await loadPackageInfo(id));
            _cache(id, isNSFW);
        }

        if(isNSFW)
        {
            nsfw_counter.count++;
            nsfw_counter.element.innerText = `(${nsfw_counter.count})`;
        }

        el.dataset.nsfw = isNSFW ? 'yes' : 'no';
        el.dataset.appid = id;
    }

    /**
     * Process list of games.
     *
     * @param  {String}  sel  CSS selector
     * @return {Promise}
     */
    async function processList(sel)
    {
        await waitPageLoading(`${sel} a[href^="https://store.steampowered.com/"], ${sel} a[href^="http://store.steampowered.com/"], ${sel} a[style*="akamaihd.net/steam/apps/"]`);

        for(const game of document.querySelectorAll(sel))
        {
            await processGame(game);
        }

        if(CACHE.updated) CACHE.save();

        if(!nsfw_counter.count)
            nsfw_counter.element.innerText = '(0)';

        Filter.nsfw.element.disabled = false;
        document.querySelector(`label[for="${Filter.nsfw.id}"]`).classList.remove('inactive');

        if(nsfw_counter.count && Filter.nsfw.element.checked)
            applyFilter();

        LOG.info(`Job completed. Requests to Steam: ${count_requests} (games in the cache: ${CACHE.NSFW.length + CACHE.SFW.length}).`);
    }

    /**
     * Main entry point.
     *
     * @param  {String}  sel  CSS selector
     * @return {Void}
     */
    function process(sel)
    {
        processList(sel);
        injectCSS();
        renderFilterForm();
        LOG.info(`App loaded (version: ${LOG.version})`);
    }

    /*
     * Main section.
     */
    for(const page in SG.Pages) if(location.pathname == page) return process(SG.Pages[page]);
    for(const page in SG.PagesMask) if(location.pathname.startsWith(page)) return process(SG.PagesMask[page]);
    for(const page in SG.PagesRegex) if((new RegExp(page)).test(location.pathname)) return process(SG.PagesRegex[page]);
})();
