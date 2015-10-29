var async = require('async');
var util = require('util');
var request = require('request');
var path = require('path');
var mkdirp = require('mkdirp');
var exec = require('child_process').exec
var storage = require('node-persist');
var glob = require("glob")
var wordwrap = require('wordwrap');
var gm = require('gm');
var id3 = require('id3js');
var fs = require('fs');


// TODO:
// - Try multiple times for each search result
// - check for required programs
// - Use "spawn" instead of "exec" for downloads so that you can see feedback/progress in real-time
// - Make sure the editing loop doesn't go beyond the duration of the video
// - Make a grid of videos instead of sequential ediing -- but keep oldediting styles. command line option for editing style.
// - Do all editing as AVI (or some other low-compression format) and only MP$ at the end.
// https://ffmpeg.org/pipermail/ffmpeg-user/2011-July/001718.html

//
// COMMAND LINE OPTIONS
//
var title = "Amateur Fantasy";
var search = "sybian"
var tags = ["teen"];
var output = path.resolve(process.env.HOME, "Desktop", "fantasy03.mp4");
var num_videos=5;
var glitch = 0.5;


//
//	CONFIG
//
var working_dir = output.replace(path.extname(output), "_tmp");
var silence = path.join(working_dir, "silence.mp2");
var intro_image = path.join(working_dir, "intro.png");
var intro_video = path.join(working_dir, "intro.avi");
var outro_image = path.join(working_dir, "outro.png");
var outro_video = path.join(working_dir, "outro.avi");
var concatted = path.join(working_dir, "concatted.avi");
var concatted_audio = path.join(working_dir, "concatted_audio.mp3");
var glitched_avi = path.join(working_dir, "glitched.avi");
var glitched_waudio = path.join(working_dir, "glitched_waudio.avi");
var assembled = path.join(working_dir, "assembled.mp4");
var soundtrack = path.join(working_dir, "soundtrack.mp4");
var bold = path.join(__dirname, "fonts", "MAGNUM.TTF");
var med = path.join(__dirname, "fonts", "PressStart2P.ttf");
var light = path.join(__dirname, "fonts", "Railway.ttf");
var autodatamosh = path.join(__dirname, "bin", "autodatamosh.pl");


var levels="ultrafast superfast veryfast faster fast medium slow slower veryslow".split(" "); // for FFMPEG

//
//	FUNCTIONS
//


// ----------------------------------------------------------------
var make_working_dir = function(done) {
	console.log("working_dir", working_dir)
	mkdirp(working_dir, done);
}

// ----------------------------------------------------------------
var init_persist = function(done){
	var stringify = function(obj){ return JSON.stringify(obj, undefined, 2); };
	storage.initSync({dir:working_dir, logging: false, stringify: stringify });	
	done();
}

// ----------------------------------------------------------------
var search_pornhub = function(done) {
	if(storage.getItemSync("pornhub")) return done();

	var id = "44bc40f3bc04f65b7a35";
	var url = util.format('http://www.pornhub.com/webmasters/search?id=%s&search=%s&tags[]=%s', 
		id, search, tags.join(","));
	console.log(url);
	request(url, function (error, response, body) {
		if (!error && response.statusCode == 200) {
			
			var json = JSON.parse(body);
			console.log("pornhub", json.videos.length, "results");

			var search_results = json.videos.map(function(video){
				return {title: video.title, 
					url: video.url, 
					views: parseInt(video.views),
					id: video.video_id };
			});

			storage.setItemSync("pornhub", search_results)
			done();

		} 
		else 
			done("couldn't get search_pornhub results");
	})
}

// ----------------------------------------------------------------
var search_youporn = function(done) {
	if(storage.getItemSync("youporn")) return done();

	var url = util.format('http://www.youporn.com/api/webmasters/search?search=%s&tags[]=%s', 
		search, tags.join(","));
	console.log(url);
	request(url, function (error, response, body) {
		if (!error && response.statusCode == 200) {
			var json = JSON.parse(body);
			console.log("youporn", json.video.length, "results");

			var search_results = json.video.map(function(video){
				return {title: video.title, 
					url: video.url, 
					views: parseInt(video.views),
					id: video.video_id };
			});

			storage.setItemSync("youporn", search_results)
			done();
		}
		else 
			done("couldn't get search_youporn results");
	});
}

// ----------------------------------------------------------------
var search_redtube = function(done) {
	if(storage.getItemSync("redtube")) return done();

	var url = util.format('http://api.redtube.com/?data=redtube.Videos.searchVideos&output=json&search=%s&tags[]=%s', 
		search, tags.join(","));
	console.log(url);
	request(url, function (error, response, body) {
		if (!error && response.statusCode == 200) {
			var json = JSON.parse(body);
			console.log("redtube", json.videos.length, "results");

			var search_results = json.videos.map(function(video){
				return {title: video.video.title, 
					url: video.video.url, 
					views: parseInt(video.video.views), 
					id: video.video.video_id };
			});

			storage.setItemSync("redtube", search_results);
			done();
		} 
		else 
			done("couldn't get search_redtube results");
	});
}

// ----------------------------------------------------------------
var get_top_videos = function(done) {
	if(storage.getItemSync("top_videos")) return done();	

	var search_results = [].concat(
		storage.getItemSync("redtube"), 
		//storage.getItemSync("youporn"), 
		storage.getItemSync("pornhub")
	);

	search_results.sort(function(a,b){
		if(a.views > b.views) return -1;
		if(a.views < b.views) return 1;
		return 0;
	});

	var top_videos = search_results.slice(0, num_videos);
	storage.setItemSync("top_videos", top_videos);
	done();
}

// ----------------------------------------------------------------
var download_videos = function(done){
	var top_videos = storage.getItemSync("top_videos");

	async.forEachOf(top_videos, function(video, id, next){
		if(video.path) return next();

		var cmd = util.format('youtube-dl --no-continue -o "%s/%s.%%(ext)s" "%s"', working_dir, video.id, video.url);
		console.log(cmd);
		exec(cmd, function(error, stdout, stderr){
			if(error) return next(error);

			var pattern = util.format("%s/%s.*", working_dir, video.id);
			glob(pattern, {}, function (err, files) {
				if(err) return next(err);
				if(!files.length) return next("couldn't find file");

				top_videos[id].path =  files[0];
				storage.setItemSync("top_videos", top_videos);
				next();
			});
		});
	}, done);
}


// ---------------------------------------------------------------- 
var get_duration = function(path, callback) {
	var cmd = util.format('ffprobe -i "%s"', path);
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
var get_durations = function(done) {

	var top_videos = storage.getItemSync("top_videos");

	async.forEachOfSeries(top_videos, function(video, id, next){
		if(video.duration) return next();

		get_duration(video.path, function(err, duration){
			if(err) return next(err);

			top_videos[id].duration = duration;
			storage.setItemSync("top_videos", top_videos);
			next();
		});
	}, done);
}


// ----------------------------------------------------------------
var get_song_info = function(done) {
	if(storage.getItemSync("song")) return done();

	var pattern = path.join(__dirname, "music", "*.mp3")
	glob( pattern, {}, function(err, files){
		if(err) return done("Error picking song");

		var n = Math.floor(Math.random()*files.length);
		var path = files[n];	

		id3({ file: path, type: id3.OPEN_LOCAL }, function(err, tags) {
			if(err) return done(err);
			console.log(tags);

			get_duration(path, function(err, duration){
				if(err) return done(err);

				var song = {tags: tags, duration: duration, path: path};
		
				storage.setItemSync("song", song);
				done();
			});
		});
	});
}

// -----------------------------------------------------------------
var make_silence = function(done){
	fs.stat(silence, function(err, stat) {
		if(err==null) return done();

		var cmd = 'ffmpeg -ar 48000 -t 15 -f s16le -acodec pcm_s16le -i /dev/zero -ab 64K -f mp2 ';
		cmd += util.format('-acodec mp2 -y "%s"', silence);

		console.log("======make_silence======");
		console.log(cmd);
		exec(cmd, function(error, stdout, stderr){
			if(error) return done(error);

			fs.access(silence, fs.R_OK | fs.W_OK, done);
		});
	});
}

// -----------------------------------------------------------------
var make_intro_image = function(done) {

	fs.stat(intro_image, function(err, stat) {
		if(err==null) return done();

		var song = storage.getItemSync("song");

		console.log("======make_intro_image======");

		var song_credit = wordwrap(40)(util.format("music: %s by %s", song.tags.title, song.tags.artist));
		gm(640, 640, "#000000")
			.quality(100)
			.fill( 'rgb(255, 0, 255)' )
			.font( bold )
		    .fontSize(48)
			.drawText(0, '-100', title, 'Center')
			.font( light )
			.fontSize(24)
			.drawText(0, '-50', "by Jeff Crouse", 'Center')
			.drawText(0, '-10', song_credit, 'Center')
			.write(intro_image, function(err){
				if(err) return done(err);
				fs.access(intro_image, fs.R_OK | fs.W_OK, done);
			});
	});
}

// -----------------------------------------------------------------
var make_intro_video = function(done) {
	fs.stat(intro_video, function(err, stat) {
		if(err==null) return done();

		console.log("======make_intro_video======");

		var cmd = util.format('ffmpeg -loop 1 -i "%s" -t 15 -vf scale=640:640 "%s" ', intro_image, intro_video);
		cmd += util.format('&& ffmpeg -y -i "%s" -i "%s" "%s"', intro_video, silence, intro_video);

		console.log(cmd);
		exec(cmd, function(error, stdout, stderr){
			if(error) return done(error);

			fs.access(intro_video, fs.R_OK | fs.W_OK, done);
		});
	});
}


// -----------------------------------------------------------------
var make_outro_image = function(done) {
	var job = storage.getItemSync("job");

	fs.stat(outro_image, function(err, stat) {
		if(err==null) return done();
		
		console.log("======make_outro_image======");

		var song = storage.getItemSync("song");
		var song_credit = wordwrap(40)(util.format("music: %s by %s", song.title, song.artist));
		gm(640, 640, "#000000")
			.quality(100)
			.fill( 'rgb(255, 0, 255)' )
			.font( bold )
		    .fontSize(48)
			.drawText(0, '-100', title, 'Center')
			.font( light )
			.fontSize(24)
			.drawText(0, '-50', "by Jeff Crouse", 'Center')
			.drawText(0, '-10', song_credit, 'Center')
			.write(outro_image, function(err){
				if(err) return done(err);
				fs.access(outro_image, fs.R_OK | fs.W_OK, done);
			});
	});
};

// -----------------------------------------------------------------
var make_outro_video = function(done) {

	fs.stat(outro_video, function(err, stat) {
		if(err==null) return done();

		console.log("======make_outro_video======");

		var cmd = util.format('ffmpeg -loop 1 -i "%s" -t 15 -vf scale=640:640 "%s"', outro_image, outro_video);
		cmd += util.format('&& ffmpeg -y -i "%s" -i "%s" "%s"', outro_video, silence, outro_video);

		console.log(cmd);
		exec(cmd, function(error, stdout, stderr){
			if(error) return done(error);

			fs.access(outro_video, fs.R_OK | fs.W_OK, done);
		});
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
	if(storage.getItemSync("ffmpeg")) 
		return done();

	console.log("======make_ffmpeg_command======");

	var top_videos = storage.getItemSync("top_videos");
	var song = storage.getItemSync("song");

	var cmd = util.format('ffmpeg -y ');
	top_videos.forEach(function(video){
		cmd += util.format('-i "%s" ', video.path);
	});

	var filters = [];	// the "trim" filters tha create the clips
	var clips = [];		// The pads that get passed to the "concat" filter at the end
	var duration = 0;	// The cumulative duration of the clips that have been added


	// Keep adding filters and clips until we reach the song duration
	while(duration < song.duration-10) {
		var i=0;
		top_videos.forEach(function(video){

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
	cmd += util.format('-filter_complex "%s" -map "[v]" -map "[a]" -c:v mpeg4 -vtag xvid -qscale:v 3 -c:a libmp3lame -qscale:a 4 ', filters.join(";"));
	cmd += util.format('"%s"', concatted);
	storage.setItemSync("ffmpeg", cmd);
	done();
}


// -----------------------------------------------------------------
var make_concatted = function(done) {
	fs.stat(concatted, function(err, stat) {
		if(err==null) return done();

		console.log("======make_concatted======");

		var cmd = storage.getItemSync("ffmpeg");
		console.log(cmd);
		exec(cmd, function(error, stdout, stderr){
			if(error) return done(error);

			fs.access(concatted, fs.R_OK | fs.W_OK, done);
		});
	});
}

// -----------------------------------------------------------------
var export_audio = function(done) {
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
	
	fs.stat(glitched_avi, function(err, stat) {
		if(err==null) return done();

		console.log("======make_glitch_avi======");

		var fprob = Math.map(glitch, 0, 1, 0.5, 1);
		var dprob = Math.map(glitch, 0, 1, 0, 1);
		var dmin = Math.floor(Math.map(glitch, 0, 1, 0, 10))
		var dmax = Math.floor(Math.map(glitch, 0, 1, 10, 40))

		var cmd = [
			"perl", autodatamosh,
			"-fprob", fprob, 
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
	fs.stat(assembled, function(err, stat) {
		if(err==null) return done();

		console.log("======make_assembled======");

		var song = storage.getItemSync("song");

		var cmd = util.format('ffmpeg -i "%s" -i "%s" -i "%s" -i "%s" ', 
			intro_video, glitched_waudio, outro_video, song.path);

		var filters = [];

		// Add intro video
		filters.push('[0:v]trim=start=0:end=5,scale=640:640,setpts=PTS-STARTPTS,setsar=sar=1[v0]');
		filters.push('[0:a]atrim=start=0:end=5,asetpts=PTS-STARTPTS[a0]');

		// Add main mix
		filters.push('[1:v]scale=640:640,setpts=PTS-STARTPTS,setsar=sar=1[v1]');
		filters.push('[1:a]asetpts=PTS-STARTPTS[a1]');
		
		// Add outro video
		filters.push('[2:v]trim=start=0:end=5,scale=640:640,setpts=PTS-STARTPTS,setsar=sar=1[v2]');
		filters.push('[2:a]atrim=start=0:end=5,asetpts=PTS-STARTPTS[a2]');

		// concat all clips
		filters.push('[v0][a0][v1][a1][v2][a2]concat=n=3:v=1:a=1[v][audio_track]');

		// adjust audio levels of audio tracks
		filters.push('[audio_track]volume=volume=1.5[audio_track2]')
		filters.push('[3:a]volume=volume=0.5[song]');

		// merge music into mix
		filters.push('[song][audio_track2]amerge[a]')

		// Make the rest of the command
		cmd += util.format('-filter_complex "%s" -map "[v]" -map "[a]" ', filters.join(";"));
		cmd += util.format('-c:v libx264 -preset %s -crf 18 -pix_fmt yuv420p "%s"', levels[5], assembled);

		console.log(cmd);
		exec(cmd, function(error, stdout, stderr){
			if(error) return done(error);
			
			fs.access(assembled, fs.R_OK | fs.W_OK, done);
		});
	});
}


// -----------------------------------------------------------------
var move_output = function(done) {
	fs.stat(output, function(err, stat) {
		if(err==null) return done();

		fs.rename(assembled, output, done)
	});
}


// -----------------------------------------------------------------
var cleanup = function(done) {
	done();
}

// -----------------------------------------------------------------
var tasks = [
	make_working_dir, 
	init_persist, 
	get_song_info,
	search_pornhub, 
	//search_youporn, 
	search_redtube, 
	get_top_videos, 
	download_videos,
	get_durations,
	make_ffmpeg_command,
	make_concatted,
	export_audio,
	make_glitch_avi,
	make_glitch_waudio,
	make_silence,
	make_intro_image,
	make_intro_video,
	make_outro_image,
	make_outro_video,
	make_assembled,
	move_output,
	cleanup,
];

async.series(tasks, function(err){
	if(err) console.log(err);
	else console.log("done!");
});




