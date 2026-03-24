// Mock for MagicMirror's node_helper base class
module.exports = {
  create: function (definition) {
    var instance = Object.assign(
      {
        name: "MMM-LLM-Summary",
        path: __dirname,
        sendSocketNotification: jest.fn(),
        expressApp: {},
        io: {},
      },
      definition
    );
    // Call start() to initialize state
    if (instance.start) {
      instance.start();
    }
    return instance;
  },
};
