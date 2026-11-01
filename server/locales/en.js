// @ts-check

export default {
  translation: {
    appName: "Simple blog",
    flash: {
      articles: {
        create: {
          error: "Failed to create article",
          success: "Article was created",
        },
      },
    },
    layouts: {
      application: {
        articles: "Articles",
      },
      actions: {
        view: "View",
        edit: "Edit",
        delete: "Delete",
      },
    },
    views: {
      comments: {
        header: "Comments",
        empty: "No comments yet",
        content: "Comment",
        submit: "Add comment",
        required: "Enter a comment",
        tooLong: "Comment must be at most 2000 characters",
      },
      article: {
        create: {
          success: "Success",
          error: "Error",
        },
        edit: {
          success: "Success",
          error: "Error",
        },
        delete: {
          success: "Success",
          error: "Error",
        },
        title: {
          label: "Title",
        },
        content: {
          label: "Content",
          placeholder: "Enter article content",
        },
      },
      articles: {
        index: {
          header: "Articles",
          id: "ID",
          title: "Title",
          createdAt: "Created at",
          actions: "Actions",
          new: "New article",
          delete_confirmation: "Delete confirmation",
        },
        edit: {
          header: "Edit article",
          submit: "Update",
        },
        new: {
          header: "New article",
          submit: "Create",
        },
      },

      welcome: {
        index: {
          hello: "Hello from Hexlet!",
          description: "Online programming school",
          more: "Learn more",
        },
      },
    },
  },
};
