#!/usr/bin/env node

var async = require('async');
var util = require('util');
var request = require('request');
var path = require('path');
var mkdirp = require('mkdirp');
var exec = require('child_process').exec;
var spawn = require('child_process').spawn
var glob = require("glob")
var wordwrap = require('wordwrap');
var gm = require('gm');
var mm = require('musicmetadata');
var http = require('http');
var fs = require('fs');
var rimraf = require('rimraf');
var which = require('which');
var argv = require('yargs')
    .usage('Usage: $0 <command> [options]')
    .command('fantasy.js', 'Create a fantasy video mashup')
    .demand(1)
    //.example('$0 count -f foo.js', 'count the lines in the given file')
	.option('t', {
		alias: 'title',
		demand: false,
		default: 'My Fantasy',
		describe: 'Title of the video we are creating',
		type: 'string'
	})
	.option('s', {
		alias: 'song',
		demand: true,
		describe: 'Song to be used in the background',
		type: 'string'
	})
	.option('p', {
		alias: 'porn_search',
		demand: false,
		default: 'teacher',
		describe: 'What term should we use to search for the porn videos',
		type: 'string'
	})
	.option('y', {
		alias: 'youtube_search',
		demand: false,
		default: 'fruit',
		describe: 'What term should we use to search for the porn videos?',
		type: 'string'
	})
	.option('n', {
		alias: 'num_sources',
		demand: false,
		default: 4,
		describe: 'How many porn videos and youtube videos should we get?',
		type: 'number'
	})
	.option('g', {
		alias: 'glitch',
		demand: false,
		default: 10,
		describe: 'How glitchy should the end result be? (0-100)',
		type: 'number'
	})
    .help('h')
    .alias('h', 'help')
    .epilog('copyright 2015')
    .argv;



//
// COMMAND LINE OPTIONS
//
var title = argv.title;
var porn_search = argv.porn_search;
var youtube_search = argv.youtube_search;
var nsources = argv.num_sources;
var glitch_factor = argv.glitch;
var output = path.resolve(argv._[0]);
var song_url = argv.song;

if(nsources < 2 || nsources > 10) {
	console.warn("nsources shoudl be between 2 and 10. Setting it to 4");
	nsources = 4;
}

if(glitch_factor < 10 || glitch_factor > 100) {
	console.warn("glitch shoudl be between 10 and 100. Setting it to 50");
	glitch_factor = 50;
}


//
//	CONFIG
//
var cyberbit = path.join(__dirname, "fonts", "Cyberbit.ttf");
var magnum = path.join(__dirname, "fonts", "MAGNUM.TTF");
var autodatamosh = path.join(__dirname, "bin", "autodatamosh.pl");
var LEVELS="ultrafast superfast veryfast faster fast medium slow slower veryslow".split(" "); // for FFMPEG
var YOUTUBE_KEY="AIzaSyDa-9oAlMPr-4y9TYwjq0ZytIRUUM8JolM";



//
//	INTERMEDIATE FILES
//
var working_dir = output.replace(path.extname(output), "_tmp");
var source_dir = path.join(working_dir, "source");
var project_path = path.join(working_dir, "project.json");
var song_path = path.join(working_dir, "song.mp3");
var edit_dir = path.join(working_dir, "edits");
var silence = path.join(edit_dir, "silence.mp2");
var intro_image = path.join(edit_dir, "intro.png");
var intro_video = path.join(edit_dir, "intro.avi");
var outro_image = path.join(edit_dir, "outro.png");
var outro_video = path.join(edit_dir, "outro.avi");
var concatted = path.join(edit_dir, "concatted.avi");
var concatted_audio = path.join(edit_dir, "concatted_audio.mp3");
var glitched_avi = path.join(edit_dir, "glitched.avi");
var glitched_waudio = path.join(edit_dir, "glitched_waudio.avi");
var assembled = path.join(edit_dir, "assembled.mp4");
var soundtrack = path.join(edit_dir, "soundtrack.mp4");


var default_project = {
	pornhub_results: null, 
	youporn_results: null, 
	redtube_results: null, 
	youtube_results: null,
	top_videos: null,
	song: {info: null, duration: null},
	ffmpeg_command: null
};
var project = null;





//
//	FUNCTIONS
//

// ----------------------------------------------------------------
var arguments_check = function(done) {
	var output_dir = path.dirname(path.resolve(output))
	fs.access(output_dir, fs.W_OK, done);
}

// ----------------------------------------------------------------
// ffmpeg with appropriate codecs, fonts, youtube-dl, autodatamosh
var requirements_check = function(done) {
	async.series([
	    function(callback){ which('ffmpeg', callback); },
	    function(callback){ which('convert', callback); },
	    function(callback){ which('perl', callback); }
	], done);
}

// ----------------------------------------------------------------
var make_working_dir = function(done) {
	console.log("working_dir", working_dir)
	async.series([
	    function(callback){ mkdirp(source_dir, callback); },
	    function(callback){ mkdirp(working_dir, callback); },
	    function(callback){ mkdirp(edit_dir, callback); },
	], done);
}

// ----------------------------------------------------------------
var open_project = function(done){
	try {
		project = require(project_path);
	} catch(e) {
		project = default_project;
	}
	done();
}

// ----------------------------------------------------------------
var save_project = function(done) {
	fs.writeFile(project_path, JSON.stringify(project, null, 4), done); 
}

// ----------------------------------------------------------------
var search_pornhub = function(done) {
	console.log("search_pornhub");
	if( project["pornhub_results"] ) return done();

	var tags = ["teen", "lesbian"];
	var id = "44bc40f3bc04f65b7a35";
	var url = util.format('http://www.pornhub.com/webmasters/search?id=%s&search=%s&tags[]=%s', 
		id, porn_search, tags.join(","));
	
	console.log(url);
	request(url, function (error, response, body) {
		if (!error && response.statusCode == 200) {
			try {
				var json = JSON.parse(body);
				console.log("pornhub", json.videos.length, "results");

				project['pornhub_results'] = json.videos.map(function(video){
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
	if( project["youporn_results"] ) return done();

	var tags = ["teen", "lesbian"];
	var url = util.format('http://www.youporn.com/api/webmasters/search?search=%s&tags[]=%s', 
		porn_search, tags.join(","));
	console.log(url);
	request(url, function (error, response, body) {
		if (!error && response.statusCode == 200) {
			try {
				var json = JSON.parse(body);
				console.log("youporn", json.video.length, "results");

				project['youporn_results'] = json.video.map(function(video){
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
	if( project["redtube_results"] ) return done();

	var tags = ["teen", "lesbian"];
	var url = util.format('http://api.redtube.com/?data=redtube.Videos.searchVideos&output=json&search=%s&tags[]=%s', 
		porn_search, tags.join(","));
	console.log(url);
	request(url, function (error, response, body) {
		if (!error && response.statusCode == 200) {
			try {
				var json = JSON.parse(body);
				console.log("redtube", json.videos.length, "results");

				project['redtube_results'] = json.videos.map(function(video){
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
	if( project['youtube_results'] ) return done();

	var url = util.format('https://www.googleapis.com/youtube/v3/search?key=%s&part=snippet&q=%s&maxResults=%s', 
		YOUTUBE_KEY, youtube_search, nsources);
	console.log(url);
	request(url, function (error, response, body) {
		if(error || response.statusCode != 200)
			return done("couldn't get youtube results");
		try {
			var json = JSON.parse(body);
			console.log("youtube", json.items.length, "results");
			
			project['youtube_results'] = json.items.map(function(item){
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
	if( project["top_videos"] ) return done();	

	var search_results = [].concat(
		project["redtube_results"], 
		project["youporn_results"], 
		project["pornhub_results"]
	);

	search_results.sort(function(a,b){
		if(a.views > b.views) return -1;
		if(a.views < b.views) return 1;
		return 0;
	});

	var top_videos = search_results.slice(0, nsources);

	var youtube = project["youtube_results"];
	project['top_videos'] = top_videos.concat(youtube);

	save_project(done);
}

// ----------------------------------------------------------------
var download_videos = function(done){
	console.log("download_videos");

	async.eachSeries(project['top_videos'], function(video, next){
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

	async.forEachOfSeries(project['top_videos'], function(video, id, next){
		if(video.duration) return next();

		get_duration(video.path, function(err, duration){
			if(err) return next(err);

			video.duration = duration;
			save_project(next);
		});
	}, done);
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
var download_song = function(done) {
	console.log("download_song", song_url);

	fs.access(song_path, fs.R_OK | fs.W_OK, function(err){
		if(err) download(song_url, song_path, done);
		else done();
	});
}

// ----------------------------------------------------------------
var get_song_duration = function(done) {
	console.log("get_song_duration");
	if( project.song.duration ) return done();

	get_duration(song_path, function(err, duration){
		if(err) return done(err);

		project.song.duration = duration;
		save_project(done);
	});
}

// ----------------------------------------------------------------
var get_song_info = function(done) {
	console.log("get_song_info");
	if( project.song.info ) return done();

	var parser = mm(fs.createReadStream(song_path), function (err, metadata) {

		if(err) return done(err);

		metadata.picture = null;
		console.log(metadata);

		project.song.info = metadata;
		save_project(done);
	});
}

// -----------------------------------------------------------------
var make_silence = function(done){
	console.log("make_silence");
	fs.stat(silence, function(err, stat) {
		if(err==null) return done();

		var cmd = 'ffmpeg -ar 48000 -t 15 -f s16le -acodec pcm_s16le -i /dev/zero ';
		cmd += util.format('-ab 64K -f mp2 -acodec mp2 -y "%s"', silence);

		console.log("======make_silence======");
		console.log(cmd);
		exec(cmd, function(error, stdout, stderr){
			if(error) return done(error);

			fs.access(silence, fs.R_OK | fs.W_OK, done);
		});
	});
}


// -----------------------------------------------------------------
var gm_to_video = function(img, image_path, video_path, callback) {

	img.write(image_path, function(err){
		if(err) return callback(err);

		fs.access(image_path, fs.R_OK | fs.W_OK, function(err){
			if(err) return callback(err);

			var cmd = util.format('ffmpeg -y -loop 1 -i "%s" -r 23.976 -t 15 -vcodec qtrle "%s"', image_path, video_path);
			cmd += util.format('&& ffmpeg -y -i "%s" -i "%s" "%s"', image_path, silence, video_path);

			exec(cmd, function(err, stdout, stderr){
				if(err) return callback(err);

				fs.access(video_path, fs.R_OK | fs.W_OK, callback);
			});
		});
	});
}

// -----------------------------------------------------------------
var make_intro = function(done) {
	console.log("make_intro_image");
	fs.stat(intro_video, function(err, stat) {
		if(err==null) return done();

		console.log("======make_intro_image======");

		var img = gm(640, 640, "#000000")
			.quality(100)
			.fill( 'rgb(255, 0, 255)' )
			.font( magnum ).fontSize(48)
			.drawText(0, '-100', title, 'Center')
			.font( cyberbit ).fontSize(24)
			.drawText(0, '-50', "by Jeff Crouse", 'Center')
			.drawText(0, '-10', project.song.info.title, 'Center')
			.drawText(0, '20', "by "+project.song.info.artist, 'Center');

		gm_to_video(img, intro_image, intro_video, done);
	});
}


// -----------------------------------------------------------------
var make_outro = function(done) {
	console.log("make_outro_image");

	fs.stat(outro_video, function(err, stat) {
		if(err==null) return done();
		
		console.log("======make_outro_image======");

		var x = 0;
		var y = -240;

		var img = gm(640, 640, "#000000")
			.quality(100)
			.fill( 'rgb(255, 0, 255)' );
		
		img.font( magnum ).fontSize(48)
			.drawText(x, y, title, 'Center')
			.font( cyberbit ).fontSize(18);

		y += 30;	
		img.drawText(x, y, "by Jeff Crouse", 'Center');
		
		y += 50;
		img.drawText(x, y, "VIDEOS", 'Center');		

		project.top_videos.forEach(function(video){
			y += 30;
			img.drawText(x, y.toString(), video.title, 'Center');

			y += 30;
			img.drawText(x, y.toString(), video.url, 'Center');
		});

		gm_to_video(img, outro_image, outro_video, done);
	});
};


// -----------------------------------------------------------------
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

var round2 = function(num) {
	return Math.round(num * 10) / 10;
}
var randomRange = function(min, max) {
    return round2(Math.random() * (max - min) + min);
}



// -----------------------------------------------------------------
var make_ffmpeg_command = function(done) {
	console.log("make_ffmpeg_command");
	if( project.ffmpeg_command ) 
		return done();

	console.log("======make_ffmpeg_command======");

	var filters = [];	// the "trim" filters tha create the clips
	var clips = [];		// The pads that get passed to the "concat" filter at the end
	var duration = 0;	// The cumulative duration of the clips that have been added

	// Keep adding filters and clips until we reach the song duration
	while(duration < project.song.duration-10) {
		var i=0;
		project["top_videos"].forEach(function(video){

			var start = video.pos ? round2(video.pos) : video.duration/2.0;
			var t = randomRange(2, 4);			
			var end = round2(start + t);
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
	project["top_videos"].forEach(function(video){
		cmd += util.format('-i "%s" ', video.path);
	});
	cmd += util.format('-filter_complex "%s" -map "[v]" -map "[a]" ', filters.join(";"));
	cmd += util.format('-c:v mpeg4 -vtag xvid -qscale:v 3 -c:a libmp3lame -qscale:a 4 "%s"', concatted);

	project.ffmpeg_command = cmd;

	save_project(done);
}


// -----------------------------------------------------------------
var make_concatted = function(done) {
	console.log("make_concatted");
	fs.stat(concatted, function(err, stat) {
		if(err==null) return done();

		console.log("======make_concatted======");

		console.log(project.ffmpeg_command);
		exec(project.ffmpeg_command, function(error, stdout, stderr){
			if(error) return done(error);

			fs.access(concatted, fs.R_OK | fs.W_OK, done);
		});
	});
}

// -----------------------------------------------------------------
var export_audio = function(done) {
	console.log("export_audio");

	fs.stat(concatted_audio, function(err, stat){
		if(err==null) return done();

		console.log("======export_audio======");

		var cmd = util.format('ffmpeg -i "%s" -b:a 192K -vn "%s"', concatted, concatted_audio);
		console.log(cmd);
		exec(cmd, function(error, stdout, stderr){
			if(error) return done(error);

			fs.access(concatted_audio, fs.R_OK | fs.W_OK, done);
		});
	});
}

Math.clamp = function(num, min, max) {
	if(min>max) console.warn("Math.clamp: min > max");
	return Math.min(Math.max(num, min), max);
};

Math.map = function (value, istart, istop, ostart, ostop, clamp) {
	var val = ostart + (ostop - ostart) * ((value - istart) / (istop - istart));
	return clamp ? Math.clamp(val, Math.min(ostart, ostop), Math.max(ostart, ostop)) : val;
}

// -----------------------------------------------------------------
var make_glitch_avi = function(done) {
	console.log("make_glitch_avi");
	fs.stat(glitched_avi, function(err, stat) {
		if(err==null) return done();

		console.log("======make_glitch_avi======");

		var dprob = Math.map(glitch_factor, 0, 100, 0, 1);
		var dmin = Math.floor(Math.map(glitch_factor, 0, 100, 0, 10))
		var dmax = Math.floor(Math.map(glitch_factor, 0, 100, 10, 40))

		var cmd = [
			"perl", autodatamosh,
			"-dprob", dprob, 
			"-dmin", dmin, 
			"-dmax", dmax, 
			util.format('-i "%s"', concatted), 
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
var make_glitch_waudio = function(done) {
	console.log("make_glitch_waudio");
	fs.stat(glitched_waudio, function(err, stat) {
		if(err==null) return done();

		console.log("======glitched_waudio======");

		var cmd = util.format('ffmpeg -i "%s" -i "%s" -map 0:v -map 1:a "%s"', glitched_avi, concatted_audio, glitched_waudio);
		console.log(cmd);

		exec(cmd, function(error, stdout, stderr){
			if(error) return done(error);
			
			fs.access(glitched_waudio, fs.R_OK | fs.W_OK, done);
		});
	});
}


// -----------------------------------------------------------------
var make_assembled = function(done) {
	console.log("make_assembled");
	fs.stat(assembled, function(err, stat) {
		if(err==null) return done();

		console.log("======make_assembled======");

		// Kick off the command
		var cmd = util.format('ffmpeg -i "%s" -i "%s" -i "%s" -i "%s" ', 
			intro_video, glitched_waudio, outro_video, song_path);

		var filters = [];

		// Add intro video
		filters.push('[0:v]trim=start=0:end=5,scale=640:640,setpts=PTS-STARTPTS,setsar=sar=1[v0]');
		filters.push('[0:a]atrim=start=0:end=5,asetpts=PTS-STARTPTS[a0]');

		// Add main mix
		filters.push('[1:v]scale=640:640,setpts=PTS-STARTPTS,setsar=sar=1[v1]');
		filters.push('[1:a]asetpts=PTS-STARTPTS[a1]');
		
		// Add outro video
		filters.push('[2:v]trim=start=0:end=10,scale=640:640,setpts=PTS-STARTPTS,setsar=sar=1[v2]');
		filters.push('[2:a]atrim=start=0:end=10,asetpts=PTS-STARTPTS[a2]');

		// concat all clips
		filters.push('[v0][a0][v1][a1][v2][a2]concat=n=3:v=1:a=1[v][audio_track]');

		// adjust audio levels and formats of audio tracks
		filters.push('[audio_track]aformat=sample_fmts=fltp:sample_rates=44100:channel_layouts=stereo,volume=1.5[audio_track2]')
		filters.push('[3:a]aformat=sample_fmts=fltp:sample_rates=44100:channel_layouts=stereo,volume=0.5[song]');

		// merge music into mix
		filters.push('[song][audio_track2]amerge[a]')

		// Add the filters (and the stream outputs) to the command
		cmd += util.format('-filter_complex "%s" -map "[v]" -map "[a]" ', filters.join(";"));

		// Add the output options to the command.
		cmd += util.format('-c:v libx264 -preset %s -crf 18 -pix_fmt yuv420p "%s"', LEVELS[5], assembled);

		console.log(cmd);
		exec(cmd, function(error, stdout, stderr){
			if(error) return done(error);
			
			fs.access(assembled, fs.R_OK | fs.W_OK, done);
		});
	});
}


// -----------------------------------------------------------------
var move_output = function(done) {
	console.log("move_output");
	fs.stat(output, function(err, stat) {
		if(err==null) return done();

		console.log("======move_output======");
		fs.rename(assembled, output, done)
	});
}


// -----------------------------------------------------------------
var cleanup = function(done) {
	console.log("cleanup");
	//rimraf(working_dir, done);
}

// -----------------------------------------------------------------
var tasks = [
	arguments_check,
	requirements_check,
	make_working_dir, 
	open_project, 
	download_song,
	get_song_duration,
	get_song_info,
	search_pornhub, 
	search_youporn, 
	search_redtube, 
	search_youtube,
	get_top_videos, 
	download_videos,
	get_video_durations,
	make_ffmpeg_command,
	make_concatted,
	export_audio,
	make_glitch_avi,
	make_glitch_waudio,
	make_silence,
	make_intro,
	make_outro,
	make_assembled,
	move_output,
	cleanup,
];

async.series(tasks, function(err){
	if(err) console.log(err);
	else console.log("done!");
});




