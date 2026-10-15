import mongoose from "mongoose"

export const buildInboxPipeline = userId => {
  const currentUser = new mongoose.Types.ObjectId(userId)
  return [
    { $match: { $or: [{ sender: currentUser }, { receiver: currentUser }] } },
    { $sort: { createdAt: -1, _id: -1 } },
    { $project: {
      sender: 1, receiver: 1, createdAt: 1, deletedAt: 1, editedAt: 1,
      message: { $cond: [{ $ne: [{ $ifNull: ["$deletedAt", null] }, null] }, "", "$message"] },
      image: { $cond: [{ $ne: [{ $ifNull: ["$deletedAt", null] }, null] }, "", "$image"] },
      deliveredAt: 1, readAt: 1, receiptVersion: 1, __v: 1,
      otherUser: { $cond: [{ $eq: ["$sender", currentUser] }, "$receiver", "$sender"] },
      isUnread: { $and: [
        { $eq: ["$receiver", currentUser] },
        { $eq: ["$receiptVersion", 1] },
        { $eq: [{ $ifNull: ["$readAt", null] }, null] },
      ] },
    } },
    { $group: {
      _id: "$otherUser",
      lastMessage: { $first: {
        _id: "$_id", sender: "$sender", receiver: "$receiver",
        message: "$message", image: "$image", createdAt: "$createdAt",
        deletedAt: "$deletedAt", editedAt: "$editedAt", revision: "$__v",
        deliveredAt: "$deliveredAt", readAt: "$readAt", receiptVersion: "$receiptVersion",
      } },
      unreadCount: { $sum: { $cond: ["$isUnread", 1, 0] } },
    } },
    { $project: { _id: 0, userId: "$_id", lastMessage: 1, unreadCount: 1 } },
    { $sort: { "lastMessage.createdAt": -1, userId: 1 } },
  ]
}
