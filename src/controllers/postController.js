const fs = require('fs');
const sharp = require('sharp');

const { User, Post, Friend, PostPhoto, Like, Comment } = require('../models');
const asyncHandler = require('../utils/asyncHandler');
const ErrorResponse = require('../utils/errorResponse');
const responseHander = require('../utils/responseHander');
const requestHandler = require('../utils/requestHandler');

module.exports.createPost = asyncHandler(async (req, res, next) => {
  const { username } = req.user;
  const files = req.files || [];
  const { content, status } = req.body;

  if (!(files.length !== 0 || content)) {
    return next(new ErrorResponse('missing parameters', 400));
  }

  // can't build because it will not initialize default property
  const newPost = await Post.create({ createdBy: username });

  if (files.length !== 0) {
    const photoDests = [];

    files.forEach(file => {
      const uniqueName = `${Date.now()}-${Math.random().toFixed(3)}.jpg`;
      sharp(file.buffer)
        .resize(1080)
        .jpeg()
        .toFile(`./static/posts/${uniqueName}`);

      photoDests.push(`posts/${uniqueName}`);
    });

    // set photos along with response
    newPost.dataValues.photos = await PostPhoto.bulkCreate(
      photoDests.map(photoDest => ({ postId: newPost.id, photo: photoDest })),
    );
  }

  if (content) {
    newPost.content = content;
  }
  if (status) {
    newPost.status = status;
  }

  // destroy if data not valid
  try {
    await newPost.save();
  } catch (err) {
    newPost.destroy();
    return next(err);
  }

  res.status(201).json({
    status: 'success',
    data: responseHander.processPost(newPost),
  });
});

module.exports.updatePost = asyncHandler(async (req, res, next) => {
  const { removePhotos, content, status } = req.body;
  const { post } = req;
  const files = req.files || [];

  // must have at least one of data to update
  if (!(status || removePhotos || content || files.length !== 0)) {
    return next(new ErrorResponse('missing parameters', 400));
  }

  if (content) {
    post.content = content;
  }
  if (status) {
    post.status = status;
  }
  await post.validate();

  if (removePhotos) {
    // filter to get only owner photo
    const filteredPhotos = removePhotos
      .split(',')
      .map(removeId => {
        return post.photos.find(photo => photo.id === parseInt(removeId, 10));
      })
      .filter(photo => photo);

    if (filteredPhotos.length !== 0) {
      await PostPhoto.destroy({
        where: { id: filteredPhotos.map(photo => photo.id) },
      });

      filteredPhotos.forEach(photo => {
        fs.unlink(`./static/${photo.photo}`, err => {
          if (err) console.log(err);
        });
      });

      post.dataValues.photos = post.photos.filter(photo => {
        return filteredPhotos.indexOf(photo) === -1;
      });
    }
  }

  if (files.length !== 0) {
    const photoDests = [];

    files.forEach(file => {
      const uniqueName = `${Date.now()}-${Math.random().toFixed(3)}.jpg`;
      sharp(file.buffer)
        .resize(1080)
        .jpeg()
        .toFile(`./static/posts/${uniqueName}`);

      photoDests.push(`posts/${uniqueName}`);
    });

    const newPhotos = await PostPhoto.bulkCreate(
      photoDests.map(photoDest => ({ postId: post.id, photo: photoDest })),
    );

    post.dataValues.photos.push(...newPhotos);
  }

  await post.save();

  res.status(200).json({
    status: 'success',
    data: responseHander.processPost(post),
  });
});

module.exports.deletePost = asyncHandler(async (req, res, next) => {
  const { post } = req;

  const photos = await post.getPhotos();

  // delete photo from storage
  photos.forEach(photo => {
    fs.unlink(`./static/${photo.photo}`, err => {
      if (err) console.log(err);
    });
  });

  await post.destroy();

  res.status(200).json({
    status: 'success',
    data: 'deleted',
  });
});

module.exports.like = asyncHandler(async (req, res, next) => {
  const { post } = req;
  const { username } = req.user;

  const like = await Like.findOne({
    where: { liker: username, postId: post.id },
  });

  if (like) {
    await like.destroy();
    await post.increment({ like: -1 }, { where: { id: post.id } });
    return res.status(200).json({
      status: 'success',
      data: 'unliked',
    });
  }

  await Like.create({ liker: username, postId: post.id });
  await post.increment({ like: 1 }, { where: { id: post.id } });
  res.status(200).json({
    status: 'success',
    data: 'liked',
  });
});

module.exports.getLikes = asyncHandler(async (req, res, next) => {
  const { post } = req;
  const { from, limit } = requestHandler.range(req, [20, 200]);

  const likes = await post.getLikes({
    offset: from,
    limit: limit,
    order: ['createdAt'],
    include: { model: User, attributes: ['fullName'] },
  });

  res.status(200).json({
    status: 'success',
    data: likes,
  });
});

module.exports.createComment = asyncHandler(async (req, res, next) => {
  const { post } = req;
  const { username } = req.user;
  const { content } = req.body;

  if (!content) {
    return next(new ErrorResponse('missing parameters', 400));
  }

  const newComment = await Comment.create({
    commenter: username,
    postId: post.id,
    content: content,
  });

  res.status(201).json({
    status: 'success',
    data: newComment,
  });
});

module.exports.getComments = asyncHandler(async (req, res, next) => {
  const { post } = req;
  const { from, limit } = requestHandler.range(req, [20, 50]);

  // id represent createAt
  const comments = await post.getComments({
    offset: from,
    limit: limit,
    order: ['id'],
    include: { model: User, attributes: ['fullName'] },
  });

  res.status(200).json({
    status: 'success',
    data: comments,
  });
});

module.exports.getPost = asyncHandler(async (req, res, next) => {
  const { post } = req;

  res.status(200).json({
    status: 'success',
    data: responseHander.processPost(post),
  });
});
