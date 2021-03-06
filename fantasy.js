#!/usr/bin/env node

var _ = require('underscore');
var async = require('async');
var util = require('util');
var request = require('request');
var path = require('path');
var mkdirp = require('mkdirp');
var exec = require('child_process').exec;
var spawn = require('child_process').spawn
var wordwrap = require('wordwrap');
var gm = require('gm');
var mm = require('musicmetadata');
var http = require('http');
var glob = require('glob');
var fs = require('fs-extra');
var rimraf = require('rimraf');
var which = require('which');
var inquirer = require("inquirer");
var argv = require('yargs')
    .usage('Usage: $0 <command> [options]')
    .command('fantasy.js', 'Create a fantasy video mashup')
    .help('h')
    .alias('h', 'help')
    .epilog('copyright 2015')
    .argv;

// Resources
var cyberbit = path.join(__dirname, "fonts", "Cyberbit.ttf");
var magnum = path.join(__dirname, "fonts", "MAGNUM.TTF");
var autodatamosh = path.join(__dirname, "bin", "autodatamosh.pl");
var LEVELS="ultrafast superfast veryfast faster fast medium slow slower veryslow".split(" "); // for FFMPEG
var YOUTUBE_KEY="AIzaSyDa-9oAlMPr-4y9TYwjq0ZytIRUUM8JolM";


var VERSION = "0.2";
var WORKING_DIR = (argv._.length) ? path.resolve(argv._[0]) : process.cwd();
var PROJECT_PATH = path.join(WORKING_DIR, "project.json");
var PROJECT = null;

var song_path = path.join(WORKING_DIR, "song.mp3");
var source_dir = path.join(WORKING_DIR, "source");
var edit_dir = path.join(WORKING_DIR, "edits");
var silence = path.join(edit_dir, "silence.mp2");
var intro_image = path.join(edit_dir, "intro.png");
var outro_image = path.join(edit_dir, "outro.png");
var composition = path.join(edit_dir, "composition.avi");
var audio_track = path.join(edit_dir, "audio_track.aac");
var glitched_avi = path.join(edit_dir, "glitched.avi");
var assembled = path.join(edit_dir, "assembled.mp4");
var with_music = path.join(edit_dir, "with_music.mp4");


console.log("WORKING_DIR", WORKING_DIR);





Math.round2 = function(num) {
	return Math.round(num * 10) / 10;
}
var randomRange = function(min, max) {
    return Math.round2(Math.random() * (max - min) + min);
}
Math.clamp = function(num, min, max) {
	if(min>max) console.warn("Math.clamp: min > max");
	return Math.min(Math.max(num, min), max);
}
Math.map = function (value, istart, istop, ostart, ostop, clamp) {
	var val = ostart + (ostop - ostart) * ((value - istart) / (istop - istart));
	return clamp ? Math.clamp(val, Math.min(ostart, ostop), Math.max(ostart, ostop)) : val;
}
function shuffle(array) {

  var currentIndex = array.length, temporaryValue, randomIndex ;

  // While there remain elements to shuffle...
  while (0 !== currentIndex) {

    // Pick a remaining element...
    randomIndex = Math.floor(Math.random() * currentIndex);
    currentIndex -= 1;

    // And swap it with the current element.
    temporaryValue = array[currentIndex];
    array[currentIndex] = array[randomIndex];
    array[randomIndex] = temporaryValue;
  }
  return array;
}
var is_legit = function(path, callback) {
	fs.stat(path, function(err, stat) {
		if(err) return callback(err);
		if(stat.size==0) return callback("file size is 0");
		callback(null);
	});
}





// --------------------------------------------------------
var requirements_check = function(done) {
	async.series([
	    function(callback){ which('ffmpeg', callback); },
	    function(callback){ which('convert', callback); },
	    function(callback){ which('perl', callback); }
	], done);
}




// --------------------------------------------------------
var load_project = function(done) {

	// What is working_dir?
	fs.lstat(WORKING_DIR, function(err, stats){

		// Directory doesn't exist! Let's make a project
		if(err) return create_project(done);

		console.log("========== load_project");

		// Is it a directory?
		if(stats.isDirectory()) {
			fs.readdir(WORKING_DIR, function(err, files){
				// Is it empty? If so, let's make a project!
				if(files.length==0) return create_project(done);
				else validate_project(done);
			});
		} else {
			done("please provide a working directory")
		}
	});
}

// --------------------------------------------------------
// If there is an existing project, make sure it is valid
var validate_project = function(done) {
	// Can we access the project file?
	fs.access(PROJECT_PATH, fs.R_OK | fs.W_OK, function(err){
		if(err) return done("please specify either an existing fantasy project or an empty directory")

		PROJECT = require(PROJECT_PATH);
		done(null);
	});
}

// ----------------------------------------------------------------
var save_project = function(done) {
	fs.writeFile(PROJECT_PATH, JSON.stringify(PROJECT, null, 4), done); 
}


// --------------------------------------------------------
var create_project = function(done) {
	var default_project = {
		version: VERSION,
		title: null,
		author: null,
		porn_search: null,
		num_porn: null,
		youtube_search: null,
		num_youtube: null,
		glitch_factor: null,
		output_name: null,
		song_url: null,
		pornhub_results: null, 
		youporn_results: null, 
		redtube_results: null, 
		youtube_results: null,
		top_videos: null,
		song: {info: null, duration: null},
		ffmpeg_command: null,
		output_name: null,
		cleanup: false
	};

	var validate_number = function( value ) {
		var valid = !isNaN(parseFloat(value));
		return valid || "Please enter a number";
	};
	var validate_glitch = function( value ) {
		return true;
	}

	var glitch_options = [ "Destroyed", "Heavy", "Medium", "None" ];
	var songs = [
		"http://jcrouse.s3.amazonaws.com/music/02%20BX-88%20Space%20Yacht.mp3",
		"http://jcrouse.s3.amazonaws.com/music/03%20Inner%20Animal.mp3",
		"http://jcrouse.s3.amazonaws.com/music/04%20After%20Party.mp3",
		"http://jcrouse.s3.amazonaws.com/music/04%20Promethazine.mp3",
		"http://jcrouse.s3.amazonaws.com/music/04%20Super%20Gran%20Turismo%20(LUST%20Remix).mp3",
		"http://jcrouse.s3.amazonaws.com/music/05%20Drive%20Me%20Wide.mp3",
		"http://jcrouse.s3.amazonaws.com/music/06%20Tingri.mp3",
		"http://jcrouse.s3.amazonaws.com/music/09%20When%20The%20Past%20Was%20Present%20(Original%20Mix).mp3",
		"http://jcrouse.s3.amazonaws.com/music/10%20Lucky%20Tomato.mp3",
		"http://jcrouse.s3.amazonaws.com/music/11%20TUSCANY%20NEO%20SPA.mp3",
		"http://jcrouse.s3.amazonaws.com/music/14%20HOTEL%20TAIWAN%20WELCOMES%20U.mp3",
		"http://jcrouse.s3.amazonaws.com/music/24%20Yellowhead.mp3",
		"http://jcrouse.s3.amazonaws.com/music/BUBBLEGUM.mp3",
		"http://jcrouse.s3.amazonaws.com/music/Can't%20Afford.mp3",
		"http://jcrouse.s3.amazonaws.com/music/Channel%20Surfing.mp3",
		"http://jcrouse.s3.amazonaws.com/music/Landscape.mp3",
		"http://jcrouse.s3.amazonaws.com/music/Select.mp3"
	];
	var default_output = path.join(process.cwd(), "output");
	var questions = [
		{type: "input", name: "title", message: "Enter a title for your fantasy", default: "My Fantasy"},
		{type: "input", name: "author", message: "Who are you?", default: "Anonymous"},
		{type: "input", name: "porn_search", message: "Enter search terms for porn sites", default: "teen, amateur"},
		{type: "input", name: "num_porn", message: "How many porn videos to use?", default: 3, validate: validate_number, filter: Number},
		{type: "input", name: "youtube_search", message: "Enter search terms for youtube videos", default: "outer space"},
		{type: "input", name: "num_youtube", message: "How many youtube videos to use?", default: 2, validate: validate_number, filter: Number},
		{type: "list",  name: "glitch_factor", message: "How glitchy?", choices: glitch_options, filter: function( val ) { return val.toLowerCase(); }},
		{type: "list", name: "song_url", message: "Background music",  choices: songs },
		{type: "input", name: "output_name", message: "Enter a filename for your fantasy (without ext)", default: default_output},
		{type: "confirm", name: "cleanup", message: "Delete temp files when done?", default: false },
	];

	async.series([
		function(callback){ fs.ensureDir(WORKING_DIR, callback); },
	    function(callback){ fs.ensureDir(source_dir, callback); },
	    function(callback){ fs.ensureDir(edit_dir, callback); },
	], function(err){
		if(err) return done("Couldn't make project directory");

		inquirer.prompt(questions, function( answers ) {
			PROJECT = _.extend(default_project, answers);
			save_project(done);
		});
	});
}

// ----------------------------------------------------------------
var download = function(url, dest, cb) {
	console.log("download", url, dest);
	var file = fs.createWriteStream(dest);
	var request = http.get(url, function(response) {
		response.pipe(file);
		file.on('finish', function() {
			file.close(cb);
		});
	});
}

// ----------------------------------------------------------------
// TO DO: Make sure that URL is an MP3
var download_song = function(done) {
	is_legit(song_path, function(err){

		console.log("download_song", PROJECT.song_url);

		if(err) download(PROJECT.song_url, song_path, done);
		else done();
	});
}

// ----------------------------------------------------------------
var get_song_duration = function(done) {
	console.log("get_song_duration");
	if( PROJECT.song.duration ) return done();

	get_duration(song_path, function(err, duration){
		if(err) return done(err);

		PROJECT.song.duration = duration;
		save_project(done);
	});
}

// ----------------------------------------------------------------
var get_song_info = function(done) {
	console.log("get_song_info");
	if( PROJECT.song.info ) return done();

	var parser = mm(fs.createReadStream(song_path), function (err, metadata) {

		if(err) return done(err);

		metadata.picture = null;
		console.log(metadata);

		PROJECT.song.info = metadata;
		save_project(done);
	});
}



// ----------------------------------------------------------------
var search_pornhub = function(done) {
	console.log("search_pornhub");
	if( PROJECT["pornhub_results"] ) return done();

	var tags = ["teen", "lesbian"];
	var id = "44bc40f3bc04f65b7a35";
	var url = util.format('http://www.pornhub.com/webmasters/search?id=%s&search=%s&tags[]=%s', 
		id, PROJECT.porn_search, tags.join(","));
	
	console.log(url);
	request(url, function (error, response, body) {
		if (!error && response.statusCode == 200) {
			try {
				var json = JSON.parse(body);
				if(!json.videos) return done();

				console.log("pornhub", json.videos.length, "results");

				PROJECT['pornhub_results'] = json.videos.map(function(video){
					return {title: video.title, 
						url: video.url, 
						views: parseInt(video.views),
						id: video.video_id,
						source: "pornhub" };
				});
				save_project(done);
	
			} catch(e) {
				done(e);
			}
		} 
		else 
			done("couldn't get search_pornhub results");
	})
}



// ----------------------------------------------------------------
var search_youporn = function(done) {
	console.log("search_youporn");
	if( PROJECT.youporn_results ) return done();

	var tags = ["teen", "lesbian"];
	var url = util.format('http://www.youporn.com/api/webmasters/search?search=%s&tags[]=%s', 
		PROJECT.porn_search, tags.join(","));
	console.log(url);
	request(url, function (error, response, body) {
		if (!error && response.statusCode == 200) {
			try {
				var json = JSON.parse(body);
				if(!json.videos) return done();

				console.log("youporn", json.video.length, "results");

				PROJECT['youporn_results'] = json.video.map(function(video){
					return {title: video.title, 
						url: video.url, 
						views: parseInt(video.views),
						id: video.video_id,
						source: "youporn" };
				});

				save_project(done);

			} catch(e) {
				done(e);
			}
		}
		else 
			done("couldn't get search_youporn results");
	});
}

// ----------------------------------------------------------------
var search_redtube = function(done) {
	console.log("search_redtube");
	if( PROJECT.redtube_results ) return done();

	var tags = ["teen", "lesbian"];
	var url = util.format('http://api.redtube.com/?data=redtube.Videos.searchVideos&output=json&search=%s&tags[]=%s', 
		PROJECT.porn_search, tags.join(","));
	console.log(url);
	request(url, function (error, response, body) {
		if (!error && response.statusCode == 200) {
			try {
				var json = JSON.parse(body);
				if(!json.videos) return done();

				console.log("redtube", json.videos.length, "results");

				PROJECT['redtube_results'] = json.videos.map(function(video){
					return {title: video.video.title, 
						url: video.video.url, 
						views: parseInt(video.video.views), 
						id: video.video.video_id,
						source: "redtube" };
				});

				save_project(done);

			} catch(e) {
				done(e);
			}
		} 
		else 
			done("couldn't get search_redtube results");
	});
}


// ----------------------------------------------------------------
var search_youtube = function(done) {
	console.log("search_youtube");
	if( PROJECT.youtube_results ) return done();

	var url = util.format('https://www.googleapis.com/youtube/v3/search?key=%s&part=snippet&q=%s&maxResults=%s', 
		YOUTUBE_KEY, PROJECT.youtube_search, PROJECT.num_youtube);
	console.log(url);
	request(url, function (error, response, body) {
		if(error || response.statusCode != 200)
			return done("couldn't get youtube results");
		try {
			var json = JSON.parse(body);
			console.log("youtube", json.items.length, "results");
			
			PROJECT.youtube_results = json.items.map(function(item){
				return {
					title: item.snippet.title,
					url: util.format('https://www.youtube.com/watch?v=%s', item.id.videoId),
					id: item.id.videoId,
					source: "youtube"
				};
			});

			save_project(done);

		} catch(e) {
			done(e);
		}
	});
}

// ----------------------------------------------------------------
var get_top_videos = function(done) {
	console.log("get_top_videos");
	if( PROJECT.top_videos ) return done();	

	var search_results = [].concat(
		PROJECT.redtube_results, 
		PROJECT.youporn_results, 
		PROJECT.pornhub_results
	);

	search_results.sort(function(a,b){
		if(a.views > b.views) return -1;
		if(a.views < b.views) return 1;
		return 0;
	});

	var top_videos = search_results.slice(0, PROJECT.num_porn);

	PROJECT.top_videos = top_videos.concat(PROJECT.youtube_results);

	save_project(done);
}


// ----------------------------------------------------------------
var download_videos = function(done){
	console.log("download_videos");

	async.eachSeries(PROJECT.top_videos, function(video, next){
		if(video.path) return next(); // TODO: check if videos exist before calling commands

		var download = spawn('youtube-dl', ['-o', util.format('%s/%s.%%(ext)s', source_dir, video.id), video.url]);

		download.stdout.on('data', function (data) {
			console.log('stdout: ' + data);
		});

		download.stderr.on('data', function (data) {
			console.log('stderr: ' + data);
		});

		download.on('close', function (code) {
			console.log('child process exited with code ' + code);

			var pattern = util.format("%s/%s.*", source_dir, video.id);
			glob(pattern, {}, function (err, files) {
				if(err) return next(err);
				if(!files.length) return next("couldn't find file");

				video.path =  files[0];

				save_project(next);
			});
		});

	}, done);
}

// ---------------------------------------------------------------- 
var get_duration = function(path, callback) {
	var cmd = util.format('ffprobe -i "%s"', path);
	console.log(cmd);
	exec(cmd, function(err, stdout, stderr){
		var matches = stderr.match(/Duration:\s{1}(\d+?):(\d+?):(\d+\.\d+?),/);
		if(err) {
			callback(err);
		} else if(!matches || matches.length < 4) {
			callback("Couldn't determine video duration");
		} else {
			var hours = parseInt(matches[1], 10);
			var minutes = parseInt(matches[2], 10);
			var seconds = parseFloat(matches[3], 10);
			var duration = (hours*3600) + (minutes*60) + seconds;
			callback(null, duration);
		}
	});
}

// ----------------------------------------------------------------
var get_video_durations = function(done) {
	console.log("get_durations");

	async.forEachOfSeries(PROJECT.top_videos, function(video, id, next){
		if(video.duration) return next();

		get_duration(video.path, function(err, duration){
			if(err) return next(err);

			video.duration = duration;
			save_project(next);
		});
	}, done);
}

// -----------------------------------------------------------------
var make_intro = function(done) {
	console.log("make_intro");
	is_legit(intro_image, function(err, stat) {
		if(err==null) return done();

		console.log("======make_intro_image======");

		var img = gm(640, 640, "#000000")
			.quality(100)
			.fill( 'rgb(255, 0, 255)' )
			.font( magnum ).fontSize(48)
			.drawText(0, '-100', PROJECT.title, 'Center')
			.font( cyberbit ).fontSize(24)
			.drawText(0, '-50', "by Jeff Crouse", 'Center')
			.drawText(0, '-10', PROJECT.song.info.title, 'Center')
			.drawText(0, '20', "by "+PROJECT.song.info.artist, 'Center');

		img.write(intro_image, done);
	});
}


// -----------------------------------------------------------------
var make_outro = function(done) {
	console.log("make_outro_image");

	is_legit(outro_image, function(err, stat) {
		if(err==null) return done();
		
		console.log("======make_outro_image======");

		var x = 0;
		var y = -240;

		var img = gm(640, 640, "#000000")
			.quality(100)
			.fill( 'rgb(255, 0, 255)' );
		
		img.font( magnum ).fontSize(48)
			.drawText(x, y, PROJECT.title, 'Center')
			.font( cyberbit ).fontSize(18);

		y += 30;	
		img.drawText(x, y, "by "+PROJECT.author, 'Center');
		
		y += 50;
		img.drawText(x, y, "VIDEOS", 'Center');		

		PROJECT.top_videos.forEach(function(video){
			y += 30;
			img.drawText(x, y.toString(), video.title, 'Center');

			y += 30;
			img.drawText(x, y.toString(), video.url, 'Center');
		});
		img.write(outro_image, done);
	});
};


// -----------------------------------------------------------------
var make_ffmpeg_command = function(done) {
	if( PROJECT.ffmpeg_command ) 
		return done();

	console.log("====== make_ffmpeg_command");

	var filters = [];	// the "trim" filters tha create the clips
	var clips = [];		// The pads that get passed to the "concat" filter at the end
	var duration = 0;	// The cumulative duration of the clips that have been added

	// Keep adding filters and clips until we reach the song duration
	while(duration < PROJECT.song.duration-10) {
		var i=0;
		PROJECT.top_videos.forEach(function(video){

			var start = video.pos ? Math.round2(video.pos) : video.duration/2.0;
			var t = randomRange(2, 4);			
			var end = Math.round2(start + t);
			video.pos = end;

			if(end > video.duration) {
				end = video.duration;
				video.pos = null;
			}
			
			var vname = util.format('[v%d]', clips.length);
			var aname = util.format('[a%d]', clips.length);
			
			filters.push(util.format('[%d:v]trim=start=%s:end=%s,crop=in_h:in_h:(in_w/2)-(in_h/2):0,scale=640:640,setpts=PTS-STARTPTS,setsar=sar=1%s',i,start,end,vname));
			filters.push(util.format('[%d:a]atrim=start=%s:end=%s,asetpts=PTS-STARTPTS%s',i,start,end,aname));

			clips.push([vname,aname].join(""));
			
			duration += t;
			i++;
		});
	}

	filters.push(util.format('%sconcat=n=%d:v=1:a=1[v][a]', clips.join(""), clips.length));

	var cmd = util.format('ffmpeg -y ');
	PROJECT.top_videos.forEach(function(video){
		cmd += util.format('-i "%s" ', video.path);
	});
	cmd += util.format('-filter_complex "%s" -map "[v]" -map "[a]" ', filters.join(";"));
	cmd += util.format('-c:v mpeg4 -vtag xvid -qscale:v 3 -c:a libmp3lame -qscale:a 4 "%s"', composition);

	PROJECT.ffmpeg_command = cmd;

	save_project(done);
}


// -----------------------------------------------------------------
var make_composition = function(done) {
	console.log("make_composition");
	is_legit(composition, function(err, stat) {
		if(err==null) return done();

		console.log(PROJECT.ffmpeg_command);
		exec(PROJECT.ffmpeg_command, function(error, stdout, stderr){
			if(error) return done(error);

			fs.access(composition, fs.R_OK | fs.W_OK, done);
		});
	});
}

// -----------------------------------------------------------------
var export_audio = function(done) {
	console.log("export_audio");

	is_legit(audio_track, function(err, stat){
		if(err==null) return done();

		var cmd = util.format('ffmpeg -i "%s" -c:a libfdk_aac -b:a 128k -vn "%s"', composition, audio_track);
		console.log(cmd);
		exec(cmd, function(error, stdout, stderr){
			if(error) return done(error);

			fs.access(audio_track, fs.R_OK | fs.W_OK, done);
		});
	});
}


// -----------------------------------------------------------------
// TODO: map PROJECT.glitch_factor to an actual 0-100 number
var make_glitch_avi = function(done) {
	console.log("make_glitch_avi");
	is_legit(glitched_avi, function(err, stat) {
		if(err==null) return done();

		var glitch = 10; // PROJECT.glitch_factor

		var dprob = Math.map(glitch, 0, 100, 0, 1);
		var dmin = Math.floor(Math.map(glitch, 0, 100, 0, 10))
		var dmax = Math.floor(Math.map(glitch, 0, 100, 10, 40))

		var cmd = [
			"perl", autodatamosh,
			"-dprob", dprob, 
			"-dmin", dmin, 
			"-dmax", dmax, 
			util.format('-i "%s"', composition), 
			util.format('-o "%s"', glitched_avi)
		].join(" ");

		console.log(cmd);
		exec(cmd, function(error, stdout, stderr){
			if(error) return done(error);
			
			fs.access(glitched_avi, fs.R_OK | fs.W_OK, done);
		});
	});
}



// -----------------------------------------------------------------
var make_assembled = function(done) {
	console.log("make_assembled");
	is_legit(assembled, function(err, stat) {
		if(err==null) return done();

		// Kick off the command
		var cmd = util.format('ffmpeg -i "%s" -i "%s" -i "%s" -i "%s" ', 
			intro_image, glitched_avi, audio_track, outro_image);

		var filters = [];

		// Add intro video scale=640:640, ,
		filters.push('[0:v]trim=start=0:end=5,setpts=PTS-STARTPTS,setsar=sar=1[v0]');
		filters.push('aevalsrc=0:d=5,asetpts=PTS-STARTPTS,aformat=sample_fmts=fltp:sample_rates=44100:channel_layouts=stereo[a0]');

		// Add main mix scale=640:640,
		filters.push('[1:v]setpts=PTS-STARTPTS,setsar=sar=1[v1]');
		filters.push('[2:a]asetpts=PTS-STARTPTS,aformat=sample_fmts=fltp:sample_rates=44100:channel_layouts=stereo[a1]');
		
		// Add outro video scale=640:640,
		filters.push('[3:v]trim=start=0:end=10,setpts=PTS-STARTPTS,setsar=sar=1[v2]');
		filters.push('aevalsrc=0:d=10,asetpts=PTS-STARTPTS,aformat=sample_fmts=fltp:sample_rates=44100:channel_layouts=stereo[a2]');

		// concat all clips
		filters.push('[v0][a0][v1][a1][v2][a2]concat=n=3:v=1:a=1[v][a]');

		// Add the filters (and the stream outputs) to the command
		// Add the output options to the command.
		cmd += util.format('-filter_complex "%s" -map "[v]" -map "[a]" ', filters.join(";"));

		// Add the output options to the command.
		cmd += util.format('-c:v libx264 -c:a libfdk_aac -preset %s -crf 18 -pix_fmt yuv420p "%s"', LEVELS[8], assembled);

		console.log(cmd);
		exec(cmd, function(error, stdout, stderr){
			if(error) return done(error);
			
			fs.access(assembled, fs.R_OK | fs.W_OK, done);
		});
	});
}



// -----------------------------------------------------------------
var add_music = function(done) {
	console.log("add_music");
	is_legit(with_music, function(err) {
		if(err==null) return done();

		var cmd = util.format('ffmpeg -y -i "%s" -i "%s" ', assembled, song_path);

		var filters = [];

		// adjust audio levels and formats of audio tracks
		filters.push('[0:a]volume=1.0,aformat=sample_fmts=fltp:sample_rates=44100:channel_layouts=stereo[audio]')
		filters.push('[1:a]volume=0.5,aformat=sample_fmts=fltp:sample_rates=44100:channel_layouts=stereo[song]');

		// merge music into mix
		filters.push('[audio][song]amerge,pan=stereo:c0<c0+c2:c1<c1+c3[a]')

		// Use the original video witht he modified audio
		cmd += util.format('-filter_complex "%s" -map 0:v -map "[a]" ', filters.join(";"));

		// Add the output options to the command. 
		cmd += util.format('-c:v libx264 -c:a libfdk_aac -pix_fmt yuv420p -preset %s -crf 18 "%s"', LEVELS[7], with_music);

		console.log(cmd);
		exec(cmd, function(error, stdout, stderr){
			if(error) return done(error);
			
			fs.access(with_music, fs.R_OK | fs.W_OK, done);
		});
	});
}

// -----------------------------------------------------------------
var move_output = function(done) {
	console.log("move_output");

	var ext = path.extname(with_music);

	var output_file = path.resolve(PROJECT.output_name+ext);
	is_legit(output_file, function(err, stat) {
		if(err==null) return done();

		console.log("======move_output======");
		fs.copy(with_music, output_file, done)
	});
}


// -----------------------------------------------------------------
var cleanup = function(done) {
	console.log("cleanup");
	if(PROJECT.cleanup) {
		rimraf(WORKING_DIR, done);
	} else {
		done();
	}
}



var tasks = [
	requirements_check,
	load_project,
	download_song,
	get_song_duration,
	get_song_info,
	search_pornhub,
	search_youporn,
	//search_redtube,
	search_youtube,
	get_top_videos,
	download_videos,
	get_video_durations,
	make_intro,
	make_outro,
	make_ffmpeg_command,
	make_composition,
	export_audio,
	make_glitch_avi,
	make_assembled,
	add_music,
	move_output,
	cleanup
];

async.series(tasks, function(err){
	if(err) console.error(err);
	else console.log("done!");
});
