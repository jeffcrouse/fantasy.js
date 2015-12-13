#!/usr/bin/env node

var util = require('util');
var path = require('path');
var gm = require('gm');
var id3 = require('id3js');
var fs = require('fs');
var mm = require('musicmetadata');
var wordwrap = require('wordwrap');

var song_path = path.join('music/BUBBLEGUM.mp3');
var intro_image = path.join("intro_image.png");

var sans = path.join("fonts", "new gulim.ttf");
var title = "My Cool Video";

var parser = mm(fs.createReadStream(song_path), function (err, metadata) {
	if (err) throw err;
	gm(640, 640, "#000000")

		.quality(100)
		.fill( 'rgb(255, 0, 255)' )
		.font( sans )
	    .fontSize(48)
		.drawText(0, '-100', title, 'Center')
		.font( serif )
		.fontSize(24)
		.drawText(0, '-50', "by Jeff Crouse", 'Center')
		.drawText(0, '-10', metadata.title, 'Center')
		.drawText(0, '30', "by "+metadata.artist, 'Center')
		.encoding('Unicode')
		.write(intro_image, function(err){
			if(err) return done(err);
			fs.access(intro_image, fs.R_OK | fs.W_OK, function(err){
				process.exit(0);
			});
		});


	console.log(metadata.title);
});

// id3({ file: song_path, type: id3.OPEN_LOCAL }, function(err, tags) {
// 	if(err) return done(err);
// 	console.log(tags.title);
// });

/*
// -----------------------------------------------------------------
var make_intro_image = function(done) {
	console.log("make_intro_image");
	
}
*/
