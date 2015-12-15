# fantasy.js
create your own personal fantasy porn video from the command line!

## Requirements
1. ffmpeg >= 2.7.1 with --enable-libx264 --enable-libmp3lame [FFMPEG CompilationGuide
](https://trac.ffmpeg.org/wiki/CompilationGuide)
1. perl (should probably come pre-installed on your platform)
1. [Node.js](https://nodejs.org/en/) (tested in v0.12.7 and v4.2.3)


## Usage 
*commands used on fantasyjs.tumblr.com*

- ``./fantasy.js --song "http://jcrouse.s3.amazonaws.com/music/11%20TUSCANY%20NEO%20SPA.mp3" --title "Galaxy Quest" --porn_search "teen, amateur" --youtube_search "galaxy" -n 3 --glitch 10 output/galaxy_quest.mp4``

## Issues

Pretty pretty please post any problems you have in issues! I will try to fix it ASAP. I really want to make this usable for everyone!


## Principles to Remember:
- Do all editing with AVI (low compression). Cnly compress at the end.
- Persist all steps for quick pick-up on error
- Everything should work for everyone (ie: fallbacks for no search results, friendly error messages, etc)


## To Do

### v0.1
- Add full setup instructions and requirements in README

### v0.2 
- Make a grid of videos instead of sequential editing -- but keep old editing styles. command line option for editing style.
- Sorting videos by views results in 100% porn results from pornhub. Is this a problem? Should we force results from all sites?

### Someday/Maybe
- Launch standalone executable as an NPM module, ``sudo npm install -g fantasy.js``
- Make autodatamosh.pl in node -- it's really short! Goal is mostly to learn how it works so I can modify it. But also to elminate the perl requirement